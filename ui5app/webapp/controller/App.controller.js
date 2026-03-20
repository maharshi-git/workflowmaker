sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/Fragment",
    "sap/ui/model/json/JSONModel"
], function (Controller, Fragment, JSONModel) {
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
                this.datamanager(oEvent.data.tool, oEvent.data.sampleForm, oEvent.data.queryCode);
            } else if (oEvent.data && oEvent.data.action === "readTool") {
                this._onReadTool(oEvent.data.toolName, oEvent.source);
            } else if (oEvent.data && oEvent.data.action === "testRemote") {
                console.log("Remote Test Triggered:", oEvent.data.functionCode, oEvent.data.inputPayload);
                sap.m.MessageToast.show("Remote test triggered for: " + (oEvent.data.inputPayload ? JSON.stringify(oEvent.data.inputPayload) : "No Payload"));
            }
        },


        _onReadTool: function (sToolName, oSourceWindow) {
            var oModel = this.getView().getModel();

            // Fallback if default model is not available or not V2
            if (!oModel || !oModel.read) {
                oModel = new sap.ui.model.odata.v2.ODataModel("/odata/v2/device/");
            }

            var oResultData = {
                intent: null,
                bigForm: null,
                function: null
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

            var p3 = new Promise(function (resolve) {
                oModel.read("/ToolFunction('" + sToolName + "')", {
                    success: function (oData) { oResultData.function = oData; resolve(); },
                    error: function () { resolve(); }
                });
            });

            Promise.all([p1, p2, p3]).then(function () {
                oSourceWindow.postMessage({
                    action: "toolDataReceived",
                    toolName: sToolName,
                    data: oResultData
                }, "*");
            });
        },

        datamanager: function (oTool, aSampleForm, sQueryCode) {
            // "the UI5 app will call the service of onbordeedevice via a v2 oModel.create call"
            // Using the unnamed default model from manifest.json
            var oModel = this.getView().getModel();

            if (!oModel || !oModel.create) {
                // Fallback / manual instantiation if default model is not available or not v2
                console.warn("Default model not available or not V2, falling back to manual model creation.");
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
                defaultReportView: !!oTool.defaultReportView
            };

            oModel.create("/IntentDefinition", oPayload, {
                success: function () {
                    sap.m.MessageToast.show("Saved tool properties: " + oTool.toolName);
                },
                error: function (oErr) {
                    console.error("Error saving tool " + oTool.toolName, oErr);
                    sap.m.MessageToast.show("Error saving tool: " + oTool.toolName);
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

            if (sQueryCode) {
                var oToolFuncPayload = {
                    toolName: oTool.toolName,
                    functionCode: sQueryCode
                };
                oModel.create("/ToolFunction", oToolFuncPayload, {
                    success: function () {
                        console.log("Saved ToolFunction for: " + oTool.toolName);
                    },
                    error: function (oErr) {
                        console.error("Error saving ToolFunction for " + oTool.toolName, oErr);
                    }
                });
            }
        },

        onTabSelect: function (oEvent) {
            var sKey = oEvent.getParameter("key");
            this.getView().getModel("appView").setProperty("/selectedTab", sKey);

            var oIframe = document.getElementById("manageIframe");
            if (oIframe) {
                // Completely bypass UI5 lifecycle to avoid iframe reloads.
                // We target the iframe's container wrapper natively.
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

                // Wait slightly for iframe to render if first time, then sync Fiori theme
                setTimeout(function () {
                    var oIframe = document.getElementById("manageIframe");
                    if (oIframe && oIframe.contentWindow) {
                        // Check if current Fiori theme has 'dark' or 'light'
                        var sTheme = sap.ui.getCore().getConfiguration().getTheme();
                        var targetTheme = sTheme.toLowerCase().includes("dark") ? "dark" : "light";

                        oIframe.contentWindow.postMessage({
                            action: 'setTheme',
                            theme: targetTheme
                        }, "*");
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
        }
    });
});
