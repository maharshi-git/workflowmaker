sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/Fragment",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox"
], function (Controller, Fragment, JSONModel, MessageBox) {
    "use strict";

    return Controller.extend("workflowmaker.controller.App", {
        onInit: function () {
            var oViewModel = new JSONModel({
                sampleForm: "{\n}",
                formToBeSent: "{\n}",
                queryCode: "// No code yet",
                selectedTab: "manager"
            });
            this.getView().setModel(oViewModel, "appView");

            // Subscribe to cross-origin messages from the iframe
            window.addEventListener("message", this._onWindowMessage.bind(this), false);
            
            // Explicitly call to fetch DB properties directly avoiding flaky view listeners 
            var oModel = this.getOwnerComponent().getModel();
            if (oModel) {
                oModel.metadataLoaded().then(function () {
                    this._ensureStorageConfig();
                }.bind(this));
            } else {
                // Fallback attempt
                setTimeout(this._ensureStorageConfig.bind(this), 500);
            }
        },

        _ensureStorageConfig: function () {
            var oModel = this.getOwnerComponent().getModel() || this.getView().getModel();
            if(!oModel) return;
            
            oModel.read("/StorageConfig", {
                success: function (oData) {
                    if (oData && oData.results && oData.results.length > 0) {
                        var oConfig = oData.results[0];
                        var sPath = "/" + oModel.createKey("StorageConfig", { ID: oConfig.ID });
                        this.getView().byId("manageSidForm").bindElement(sPath);
                        
                        // Explicitly set dropdowns to match DB load
                        this.getView().byId("selChatHistory").setSelectedKey(oConfig.Chathistory);
                        this.getView().byId("selWorkflows").setSelectedKey(oConfig.workflows);
                        this.getView().byId("selBigForm").setSelectedKey(oConfig.bigForm);
                        this.getView().byId("selIntentDef").setSelectedKey(oConfig.IntentDefinition);
                        this.getView().byId("selChatStorage").setSelectedKey(oConfig.ChatStorage);
                        
                    } else {
                        var oPayload = {
                            Chathistory: "sqlite",
                            workflows: "sqlite",
                            bigForm: "sqlite",
                            IntentDefinition: "sqlite",
                            ChatStorage: "sqlite"
                        };
                        oModel.create("/StorageConfig", oPayload, {
                            success: function (oCreatedData) {
                                if(oCreatedData && oCreatedData.ID) {
                                    var sPath = "/" + oModel.createKey("StorageConfig", { ID: oCreatedData.ID });
                                    this.getView().byId("manageSidForm").bindElement(sPath);
                                }
                                
                                // Explicitly set dropdowns for initial payload
                                this.getView().byId("selChatHistory").setSelectedKey(oCreatedData ? oCreatedData.Chathistory : "sqlite");
                                this.getView().byId("selWorkflows").setSelectedKey(oCreatedData ? oCreatedData.workflows : "sqlite");
                                this.getView().byId("selBigForm").setSelectedKey(oCreatedData ? oCreatedData.bigForm : "sqlite");
                                this.getView().byId("selIntentDef").setSelectedKey(oCreatedData ? oCreatedData.IntentDefinition : "sqlite");
                                this.getView().byId("selChatStorage").setSelectedKey(oCreatedData ? oCreatedData.ChatStorage : "sqlite");
                            }.bind(this),
                            error: function (oErr) {
                                console.error("[StorageConfig Init] Failed to build default persistent configs:", oErr);
                            }
                        });
                    }
                }.bind(this)
            });
        },

        onCopyAll: function () {
            var oModel = this.getOwnerComponent().getModel() || this.getView().getModel();
            var sFrom = this.getView().byId("selMigrateFrom").getSelectedKey();
            var sTo = this.getView().byId("selMigrateTo").getSelectedKey();

            if (sFrom === sTo) {
                sap.m.MessageToast.show("Source and destination storage must be different.");
                return;
            }

            sap.m.MessageToast.show("Starting full system migration...");
            
            oModel.callFunction("/copyAll", {
                method: "POST",
                urlParameters: {
                    fromStorage: sFrom,
                    toStorage: sTo
                },
                success: function (oData) {
                    // Preformat the return message (which contains newlines)
                    sap.m.MessageBox.success(oData.copyAll || "Full migration completed.");
                },
                error: function (oErr) {
                    console.error("Full migration failed", oErr);
                    sap.m.MessageToast.show("Full migration failed. Check console for details.");
                }
            });
        },

        onCopyIntents: function () {
            var oModel = this.getOwnerComponent().getModel() || this.getView().getModel();
            var sFrom = this.getView().byId("selMigrateFrom").getSelectedKey();
            var sTo = this.getView().byId("selMigrateTo").getSelectedKey();

            if (sFrom === sTo) {
                sap.m.MessageToast.show("Source and destination storage must be different.");
                return;
            }

            sap.m.MessageToast.show("Starting migration...");
            
            oModel.callFunction("/copyIntents", {
                method: "POST",
                urlParameters: {
                    fromStorage: sFrom,
                    toStorage: sTo
                },
                success: function (oData) {
                    sap.m.MessageToast.show(oData.copyIntents || "Migration completed.");
                },
                error: function (oErr) {
                    console.error("Migration failed", oErr);
                    sap.m.MessageToast.show("Migration failed. Check console for details.");
                }
            });
        },

        onCopyWorkflows: function () {
            var oModel = this.getOwnerComponent().getModel() || this.getView().getModel();
            var sFrom = this.getView().byId("selMigrateFrom").getSelectedKey();
            var sTo = this.getView().byId("selMigrateTo").getSelectedKey();

            if (sFrom === sTo) {
                sap.m.MessageToast.show("Source and destination storage must be different.");
                return;
            }

            sap.m.MessageToast.show("Starting workflow migration...");
            
            oModel.callFunction("/copyWorkflows", {
                method: "POST",
                urlParameters: {
                    fromStorage: sFrom,
                    toStorage: sTo
                },
                success: function (oData) {
                    sap.m.MessageToast.show(oData.copyWorkflows || "Workflow migration completed.");
                },
                error: function (oErr) {
                    console.error("Workflow migration failed", oErr);
                    sap.m.MessageToast.show("Workflow migration failed. Check console for details.");
                }
            });
        },

        onCopyBigForms: function () {
            var oModel = this.getOwnerComponent().getModel() || this.getView().getModel();
            var sFrom = this.getView().byId("selMigrateFrom").getSelectedKey();
            var sTo = this.getView().byId("selMigrateTo").getSelectedKey();

            if (sFrom === sTo) {
                sap.m.MessageToast.show("Source and destination storage must be different.");
                return;
            }

            sap.m.MessageToast.show("Starting big form migration...");
            
            oModel.callFunction("/copyBigForms", {
                method: "POST",
                urlParameters: {
                    fromStorage: sFrom,
                    toStorage: sTo
                },
                success: function (oData) {
                    sap.m.MessageToast.show(oData.copyBigForms || "Big form migration completed.");
                },
                error: function (oErr) {
                    console.error("Big form migration failed", oErr);
                    sap.m.MessageToast.show("Big form migration failed. Check console for details.");
                }
            });
        },

        onSaveStorageConfig: function () {
            var oModel = this.getView().getModel();
            var oForm = this.getView().byId("manageSidForm");
            var oBindingContext = oForm.getBindingContext();
            
            if (!oBindingContext) {
                sap.m.MessageToast.show("No configuration context loaded.");
                return;
            }

            var sPath = oBindingContext.getPath();
            var oPayload = {
                Chathistory: this.getView().byId("selChatHistory").getSelectedKey(),
                workflows: this.getView().byId("selWorkflows").getSelectedKey(),
                bigForm: this.getView().byId("selBigForm").getSelectedKey(),
                IntentDefinition: this.getView().byId("selIntentDef").getSelectedKey(),
                ChatStorage: this.getView().byId("selChatStorage").getSelectedKey()
            };

            oModel.update(sPath, oPayload, {
                success: function() {
                    sap.m.MessageToast.show("Storage configuration updated successfully.");
                },
                error: function() {
                    sap.m.MessageToast.show("Failed to completely sync storage configuration.");
                }
            });
        },

        onSideNavButtonPress: function () {
            var oToolPage = this.byId("toolPage");
            var bSideExpanded = oToolPage.getSideExpanded();
            this._setToggleButtonTooltip(bSideExpanded);
            oToolPage.setSideExpanded(!bSideExpanded);
        },

        _setToggleButtonTooltip: function (bLarge) {
            var oToggleButton = this.byId('sideNavigationToggleButton');
            if (bLarge) {
                oToggleButton.setTooltip('Large Size Navigation');
            } else {
                oToggleButton.setTooltip('Small Size Navigation');
            }
        },

        onItemSelect: function (oEvent) {
            var oItem = oEvent.getParameter("item");
            var sKey = oItem.getKey();
            var oNavContainer = this.byId("pageContainer");
            
            if (sKey === "workflow") {
                oNavContainer.to(this.byId("workflowPage"));
            } else if (sKey === "managesid") {
                oNavContainer.to(this.byId("manageSidPage"));
            }
        },

        _onWindowMessage: function (oEvent) {
            if (oEvent.data && oEvent.data.action === "toolUpdated") {
                this.getView().getModel("appView").setProperty(
                    "/sampleForm",
                    JSON.stringify(oEvent.data.sampleForm || [], null, 2)
                );
                this.getView().getModel("appView").setProperty(
                    "/formToBeSent",
                    JSON.stringify(oEvent.data.formToBeSent || {}, null, 2)
                );
                this.getView().getModel("appView").setProperty(
                    "/queryCode",
                    oEvent.data.queryCode || "// No code generated yet"
                );
            } else if (oEvent.data && oEvent.data.action === "saveTool") {
                this.datamanager(oEvent.data.tool, oEvent.data.sampleForm, oEvent.data.queryCode, oEvent.data.configJson);
            } else if (oEvent.data && oEvent.data.action === "readTool") {
                this._onReadTool(oEvent.data.toolName, oEvent.source);
            } else if (oEvent.data && oEvent.data.action === "executeWorkflow") {
                this._onExecuteWorkflow(oEvent.data, oEvent.source);
            } else if (oEvent.data && oEvent.data.action === "executeIsolatedApiTest") {
                this._onExecuteIsolatedApiTest(oEvent.data, oEvent.source);
            }
        },

        _onReadTool: function (sToolName, oSourceWindow) {
            var oModel = this.getView().getModel();
            if (!oModel || !oModel.read) {
                oModel = new sap.ui.model.odata.v2.ODataModel("/odata/v2/device/");
            }

            var oResultData = {
                intent: null,
                bigForm: null,
                configFlow: null
            };

            var p1 = new Promise(function (resolve) {
                oModel.read("/IntentDefinition('" + sToolName + "')", {
                    success: function (oData) { oResultData.intent = oData; resolve(); },
                    error: function () { resolve(); }
                });
            });

            var p2 = new Promise(function (resolve) {
                oModel.read("/BigForm('" + sToolName + "')", {
                    success: function (oData) { oResultData.bigForm = oData; resolve(); },
                    error: function () { resolve(); }
                });
            });

            var p4 = new Promise(function (resolve) {
                oModel.read("/WorkflowConfig('" + sToolName + "')", {
                    success: function (oData) { oResultData.configFlow = oData; resolve(); },
                    error: function () { resolve(); }
                });
            });

            Promise.all([p1, p2, p4]).then(function () {
                oSourceWindow.postMessage({
                    action: "toolDataReceived",
                    toolName: sToolName,
                    data: oResultData
                }, "*");
            });
        },

        datamanager: function (oTool, aSampleForm, sQueryCode, sConfigJson) {
            var oModel = this.getView().getModel();
            if (!oModel || !oModel.create) {
                oModel = new sap.ui.model.odata.v2.ODataModel("/odata/v2/device/");
            }

            var oPayload = {
                toolName: oTool.toolName,
                active: !!oTool.active,
                title: oTool.title || "",
                knowledge: oTool.knowledge || "",
                appLink: oTool.appLink || "",
                staticInstruction: oTool.staticInstruction || "",
                operationType: oTool.operationType || "",
                operationSubtype: oTool.operationSubtype || "",
                defaultReportView: !!oTool.defaultReportView,
                advancedCodeExec: !!oTool.advancedCodeExec
            };

            oModel.create("/IntentDefinition", oPayload, {
                success: function () {
                    sap.m.MessageToast.show("Saved tool properties: " + oTool.toolName);
                },
                error: function (oErr) {
                    console.error("Error saving tool " + oTool.toolName, oErr);
                }
            });

            if (aSampleForm) {
                var oBigFormPayload = {
                    toolName: oTool.toolName,
                    sampleForm: JSON.stringify(aSampleForm)
                };
                oModel.create("/BigForm", oBigFormPayload, {
                    success: function () {
                        console.log("Saved BigForm for: " + oTool.toolName);
                    },
                    error: function (oErr) {
                        console.error("Error saving BigForm for " + oTool.toolName, oErr);
                    }
                });
            }


            if (sConfigJson) {
                var oConfigPayload = {
                    toolName: oTool.toolName,
                    configJson: sConfigJson
                };
                oModel.create("/WorkflowConfig", oConfigPayload, {
                    success: function () {
                        console.log("Saved WorkflowConfig for: " + oTool.toolName);
                    },
                    error: function (oErr) {
                        console.error("Error saving WorkflowConfig for " + oTool.toolName, oErr);
                    }
                });
            }
        },

        onTabSelect: function (oEvent) {
            var sKey = oEvent.getParameter("key");
            this.getView().getModel("appView").setProperty("/selectedTab", sKey);

            var oIframe = document.getElementById("manageIframe");
            if (oIframe) {
                if (sKey === "manager") {
                    oIframe.parentElement.style.display = "block";
                    oIframe.parentElement.style.height = "100%";
                } else {
                    oIframe.parentElement.style.display = "none";
                    oIframe.parentElement.style.height = "0px";
                }
            }
        },

        onOpenWorkflowDialog: function () {
            var oView = this.getView();
            if (!this._pWorkflowDialog) {
                this._pWorkflowDialog = Fragment.load({
                    id: oView.getId(),
                    name: "workflowmaker.view.WorkflowDialog",
                    controller: this
                }).then(function (oDialog) {
                    oView.addDependent(oDialog);
                    return oDialog;
                });
            }
            this._pWorkflowDialog.then(function (oDialog) {
                oDialog.open();
                setTimeout(function () {
                    var oIframe = document.getElementById("manageIframe");
                    if (oIframe && oIframe.contentWindow) {
                        var sTheme = sap.ui.getCore().getConfiguration().getTheme();
                        var targetTheme = sTheme.toLowerCase().includes("dark") ? "dark" : "light";
                        oIframe.contentWindow.postMessage({ action: 'setTheme', theme: targetTheme }, "*");
                    }
                }, 300);
            });
        },

        onCloseWorkflowDialog: function () {
            if (this._pWorkflowDialog) {
                this._pWorkflowDialog.then(function (oDialog) {
                    oDialog.close();
                });
            }
        },

        _onExecuteWorkflow: function (oData, oSourceWindow) {
            var oModel = this.getView().getModel();
            if (!oModel || !oModel.create) oModel = new sap.ui.model.odata.v2.ODataModel("/odata/v2/device/");

            var oPayload = {
                toolName: oData.toolName,
                testMode: !!oData.testMode,
                inputPayload: oData.inputPayload
            };

            sap.m.MessageToast.show("Executing workflow: " + oData.toolName);

            oModel.create("/ExecuteWorkflow", oPayload, {
                success: function (oResult) {
                    oSourceWindow.postMessage({ action: 'workflowExecuted', response: oResult.outputResponse }, '*');
                },
                error: function (oErr) {
                    console.error("Error executing workflow", oErr);
                }
            });
        },

        _onExecuteIsolatedApiTest: function (oData, oSourceWindow) {
            var oModel = this.getView().getModel();
            if (!oModel || !oModel.create) oModel = new sap.ui.model.odata.v2.ODataModel("/odata/v2/device/");

            var oPayload = {
                toolName: oData.toolName,
                serviceName: oData.serviceName,
                entitySet: oData.entitySet,
                operationType: oData.operationType,
                apiType: oData.apiType,
                inputPayload: oData.inputPayload,
                expands: oData.expands
            };

            oModel.create("/TestAPICall", oPayload, {
                success: function (oResult) {
                    oSourceWindow.postMessage({ action: 'apiTestExecuted', response: oResult.outputResponse }, '*');
                },
                error: function (oErr) {
                    console.error("Error executing isolated API test", oErr);
                }
            });
        }
    });
});
