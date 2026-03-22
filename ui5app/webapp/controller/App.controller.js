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
                function: null,
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

            var p3 = new Promise(function (resolve) {
                oModel.read("/ToolFunction('" + sToolName + "')", {
                    success: function (oData) { oResultData.function = oData; resolve(); },
                    error: function () { resolve(); }
                });
            });

            var p4 = new Promise(function (resolve) {
                oModel.read("/WorkflowConfig('" + sToolName + "')", {
                    success: function (oData) { oResultData.configFlow = oData; resolve(); },
                    error: function () { resolve(); }
                });
            });

            Promise.all([p1, p2, p3, p4]).then(function () {
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
