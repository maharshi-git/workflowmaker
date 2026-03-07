/**
 * SAP OData EDMX Metadata Parser
 * Parses EDMX XML documents and extracts:
 *  - Simplified Metadata (EntitySets with filterable/sortable/key properties)
 *  - Metadata Traversing Map (navigation between entities)
 *
 * @author Maharshi Mallick
 */

class MetadataParser {
    constructor() {
        this.rawXml = null;
        this.xmlDoc = null;
        this.namespaces = {};
    }

    /**
     * Parse an EDMX XML string and return the full extracted result.
     * @param {string} xmlString - The raw EDMX XML content
     * @returns {{ simplifiedMetadata: Object[], traversingMap: Object[], functionImports: Object[], stats: Object }}
     */
    parse(xmlString) {
        this.rawXml = xmlString;
        this.xmlDoc = new DOMParser().parseFromString(xmlString, 'application/xml');

        // Check for parse errors
        const parseError = this.xmlDoc.querySelector('parsererror');
        if (parseError) {
            throw new Error('Invalid XML: ' + parseError.textContent.substring(0, 200));
        }

        // Gather namespace prefixes from the document
        this._resolveNamespaces();

        // 1. Parse EntityContainer → EntitySets, AssociationSets
        const entitySets = this._parseEntitySets();
        const associationSets = this._parseAssociationSets();

        // 2. Parse EntityTypes
        const entityTypes = this._parseEntityTypes();

        // 3. Parse Associations (full definitions)
        const associations = this._parseAssociations();

        // 4. Parse FunctionImports
        const functionImports = this._parseFunctionImports();

        // 5. Build simplified metadata
        const simplifiedMetadata = this._buildSimplifiedMetadata(entitySets, entityTypes);

        // 6. Build traversing map
        const traversingMap = this._buildTraversingMap(entitySets, entityTypes, associations, associationSets);

        // 7. Compute stats
        let totalProperties = 0;
        let totalNavigations = 0;
        simplifiedMetadata.forEach(e => {
            totalProperties += e.allProperties?.length || 0;
        });
        traversingMap.forEach(t => {
            totalNavigations += t.navigations?.length || 0;
        });

        return {
            serviceName: this.serviceName || 'ODataService',
            simplifiedMetadata,
            traversingMap,
            functionImports,
            stats: {
                entitySets: simplifiedMetadata.length,
                totalProperties,
                navigations: totalNavigations,
                functionImports: functionImports.length
            }
        };
    }

    /* ──────────────────────────── INTERNAL HELPERS ──────────────────────────── */

    _resolveNamespaces() {
        // Walk all Schema elements and collect namespaces
        const schemas = this.xmlDoc.getElementsByTagName('Schema');
        this.serviceName = '';
        for (let i = 0; i < schemas.length; i++) {
            const ns = schemas[i].getAttribute('Namespace');
            if (ns) {
                this.namespaces[ns] = true;
                // Use the first namespace as the service name
                if (!this.serviceName) this.serviceName = ns;
            }
        }
    }

    /**
     * Get all elements by local tag name (namespace-agnostic).
     * @param {Element} parent
     * @param {string} localName
     * @returns {Element[]}
     */
    _getElementsByLocalName(parent, localName) {
        const all = parent.getElementsByTagName('*');
        const results = [];
        for (let i = 0; i < all.length; i++) {
            if (all[i].localName === localName) {
                results.push(all[i]);
            }
        }
        return results;
    }

    /**
     * Get SAP annotation attribute.
     * SAP metadata uses both sap: and sf: namespaced attributes.
     * We check common patterns.
     */
    _getSapAttr(el, attrName) {
        // Try sap: prefix first (SuccessFactors convention)
        const sapVariants = [
            `sap:${attrName}`,
            `sf:${attrName}`
        ];
        for (const attr of sapVariants) {
            const val = el.getAttribute(attr);
            if (val !== null) return val;
        }
        // Fallback: check all attributes for one ending with the attr name
        for (let i = 0; i < el.attributes.length; i++) {
            const a = el.attributes[i];
            if (a.localName === attrName && (a.prefix === 'sap' || a.prefix === 'sf')) {
                return a.value;
            }
        }
        return null;
    }

    /* ──────── ENTITY SETS ──────── */

    _parseEntitySets() {
        const entitySets = [];
        const esElements = this._getElementsByLocalName(this.xmlDoc, 'EntitySet');
        for (const el of esElements) {
            const name = el.getAttribute('Name');
            let entityType = el.getAttribute('EntityType') || '';
            // Remove namespace prefix like SFOData.DGExpression → DGExpression
            const shortType = entityType.includes('.') ? entityType.split('.').pop() : entityType;
            const label = this._getSapAttr(el, 'label') || name;

            // Get documentation
            let description = '';
            const longDesc = this._getElementsByLocalName(el, 'LongDescription');
            if (longDesc.length) {
                description = longDesc[0].textContent || '';
            }

            entitySets.push({
                name,
                entityType: shortType,
                fullEntityType: entityType,
                label,
                description,
                creatable: this._getSapAttr(el, 'creatable') === 'true',
                updatable: this._getSapAttr(el, 'updatable') === 'true',
                deletable: this._getSapAttr(el, 'deletable') === 'true',
                upsertable: this._getSapAttr(el, 'upsertable') === 'true'
            });
        }
        return entitySets;
    }

    /* ──────── ASSOCIATION SETS ──────── */

    _parseAssociationSets() {
        const assocSets = [];
        const asElements = this._getElementsByLocalName(this.xmlDoc, 'AssociationSet');
        for (const el of asElements) {
            const name = el.getAttribute('Name');
            let association = el.getAttribute('Association') || '';
            const shortAssoc = association.includes('.') ? association.split('.').pop() : association;

            const ends = this._getElementsByLocalName(el, 'End');
            const endsList = [];
            for (const end of ends) {
                endsList.push({
                    entitySet: end.getAttribute('EntitySet'),
                    role: end.getAttribute('Role')
                });
            }

            assocSets.push({ name, association: shortAssoc, fullAssociation: association, ends: endsList });
        }
        return assocSets;
    }

    /* ──────── ENTITY TYPES ──────── */

    _parseEntityTypes() {
        const entityTypes = {};
        const etElements = this._getElementsByLocalName(this.xmlDoc, 'EntityType');

        for (const el of etElements) {
            const name = el.getAttribute('Name');

            // Key fields
            const keyFields = [];
            const keyElements = this._getElementsByLocalName(el, 'PropertyRef');
            for (const k of keyElements) {
                keyFields.push(k.getAttribute('Name'));
            }

            // Properties
            const properties = [];
            // Only direct child Property elements (not nested inside NavigationProperty)
            for (let i = 0; i < el.childNodes.length; i++) {
                const child = el.childNodes[i];
                if (child.localName === 'Property') {
                    properties.push(this._parseProperty(child));
                }
            }

            // Navigation Properties
            const navProperties = [];
            for (let i = 0; i < el.childNodes.length; i++) {
                const child = el.childNodes[i];
                if (child.localName === 'NavigationProperty') {
                    navProperties.push(this._parseNavigationProperty(child));
                }
            }

            entityTypes[name] = {
                name,
                keyFields,
                properties,
                navigationProperties: navProperties
            };
        }

        return entityTypes;
    }

    _parseProperty(el) {
        return {
            name: el.getAttribute('Name'),
            type: el.getAttribute('Type') || '',
            nullable: el.getAttribute('Nullable'),
            maxLength: el.getAttribute('MaxLength') || null,
            filterable: this._getSapAttr(el, 'filterable') === 'true',
            sortable: this._getSapAttr(el, 'sortable') === 'true',
            label: this._getSapAttr(el, 'label') || el.getAttribute('Name'),
            required: this._getSapAttr(el, 'required') === 'true',
            visible: this._getSapAttr(el, 'visible') !== 'false',
            creatable: this._getSapAttr(el, 'creatable') === 'true',
            updatable: this._getSapAttr(el, 'updatable') === 'true'
        };
    }

    _parseNavigationProperty(el) {
        let relationship = el.getAttribute('Relationship') || '';
        const shortRelationship = relationship.includes('.') ? relationship.split('.').pop() : relationship;

        return {
            name: el.getAttribute('Name'),
            relationship: shortRelationship,
            fullRelationship: relationship,
            fromRole: el.getAttribute('FromRole'),
            toRole: el.getAttribute('ToRole'),
            filterable: this._getSapAttr(el, 'filterable') === 'true',
            sortable: this._getSapAttr(el, 'sortable') === 'true',
            label: this._getSapAttr(el, 'label') || el.getAttribute('Name')
        };
    }

    /* ──────── ASSOCIATIONS ──────── */

    _parseAssociations() {
        const associations = {};
        const aElements = this._getElementsByLocalName(this.xmlDoc, 'Association');

        for (const el of aElements) {
            const name = el.getAttribute('Name');
            const ends = this._getElementsByLocalName(el, 'End');
            const endsList = [];
            for (const end of ends) {
                let type = end.getAttribute('Type') || '';
                const shortType = type.includes('.') ? type.split('.').pop() : type;
                endsList.push({
                    type: shortType,
                    fullType: type,
                    multiplicity: end.getAttribute('Multiplicity'),
                    role: end.getAttribute('Role')
                });
            }
            associations[name] = { name, ends: endsList };
        }

        return associations;
    }

    /* ──────── FUNCTION IMPORTS ──────── */

    _parseFunctionImports() {
        const functionImports = [];
        const fiElements = this._getElementsByLocalName(this.xmlDoc, 'FunctionImport');

        for (const el of fiElements) {
            const params = [];
            const paramElements = this._getElementsByLocalName(el, 'Parameter');
            for (const p of paramElements) {
                params.push({
                    name: p.getAttribute('Name'),
                    type: p.getAttribute('Type')
                });
            }

            functionImports.push({
                name: el.getAttribute('Name'),
                returnType: el.getAttribute('ReturnType') || '',
                httpMethod: el.getAttribute('m:HttpMethod') || el.getAttributeNS('http://schemas.microsoft.com/ado/2007/08/dataservices/metadata', 'HttpMethod') || '',
                entitySet: el.getAttribute('EntitySet') || null,
                parameters: params
            });
        }

        return functionImports;
    }

    /* ──────── BUILD SIMPLIFIED METADATA ──────── */

    _buildSimplifiedMetadata(entitySets, entityTypes) {
        const result = [];

        for (const es of entitySets) {
            const et = entityTypes[es.entityType];
            if (!et) continue;

            const filterableProperties = [];
            const sortableProperties = [];
            const selectableProperties = [];
            const allProperties = [];

            for (const prop of et.properties) {
                if (prop.filterable) filterableProperties.push(prop.name);
                if (prop.sortable) sortableProperties.push(prop.name);
                if (prop.visible !== false) selectableProperties.push(prop.name);
                allProperties.push({ name: prop.name, type: prop.type, maxLength: prop.maxLength, label: prop.label });
            }

            result.push({
                entitySetName: es.name,
                entityType: es.entityType,
                label: es.label,
                description: es.description,
                keyFields: [...et.keyFields],
                allProperties,
                selectableProperties,
                filterableProperties,
                sortableProperties,
                capabilities: {
                    creatable: es.creatable,
                    updatable: es.updatable,
                    deletable: es.deletable,
                    upsertable: es.upsertable
                }
            });
        }

        return result;
    }

    /* ──────── BUILD TRAVERSAL MAP ──────── */

    _buildTraversingMap(entitySets, entityTypes, associations, associationSets) {
        // Build a mapping from EntityType → EntitySet name
        const typeToEntitySet = {};
        for (const es of entitySets) {
            typeToEntitySet[es.entityType] = es.name;
        }

        // Build a mapping from AssociationSet.name → { endEntitySets }
        const assocSetMap = {};
        for (const as of associationSets) {
            assocSetMap[as.association] = as;
        }

        const traversalMap = [];

        for (const es of entitySets) {
            const et = entityTypes[es.entityType];
            if (!et || et.navigationProperties.length === 0) continue;

            const navigations = [];

            for (const nav of et.navigationProperties) {
                const assoc = associations[nav.relationship];
                if (!assoc) continue;

                // Find the "To" end
                const toEnd = assoc.ends.find(e => e.role === nav.toRole);
                const fromEnd = assoc.ends.find(e => e.role === nav.fromRole);

                if (!toEnd) continue;

                const targetEntitySet = typeToEntitySet[toEnd.type] || toEnd.type;
                const sourceMultiplicity = fromEnd?.multiplicity || '';
                const targetMultiplicity = toEnd.multiplicity || '';

                navigations.push({
                    navigationProperty: nav.name,
                    targetEntityType: toEnd.type,
                    targetEntitySet,
                    relationship: nav.relationship,
                    sourceMultiplicity,
                    targetMultiplicity,
                    multiplicityLabel: `${sourceMultiplicity} → ${targetMultiplicity}`
                });
            }

            if (navigations.length > 0) {
                traversalMap.push({
                    sourceEntitySet: es.name,
                    sourceEntityType: es.entityType,
                    navigations
                });
            }
        }

        return traversalMap;
    }
}

// Export for use
window.MetadataParser = MetadataParser;
