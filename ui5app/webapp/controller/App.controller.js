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
