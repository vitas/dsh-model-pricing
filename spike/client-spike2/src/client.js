// Repro of the lazy-CJS factory artifact of dsh-client-modules (format taken
// from node_modules/@deepseek-ai/dsh-client-ui-settings-models/lib/client.js).
window.__ModuleLoader__.load({
	id: "dsh-model-pricing-spike2",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		let react = require("react");
		const inject = ["slots"];
		function SpikeFooter(props) {
			return react.createElement("div", {
				style: {
					margin: "16px 0",
					padding: "12px 16px",
					border: "1px dashed var(--dsw-alias-border-l2, #888)",
					borderRadius: "8px",
					color: "var(--dsw-alias-label-secondary, inherit)",
					font: "13px/1.4 ui-monospace, monospace",
				},
			}, "⚡ dsh-model-pricing S1/S2 spike — footer slot mounted. props: " + JSON.stringify(Object.keys(props ?? {})));
		}
		function apply(ctx) {
			ctx.slots.inject("settings.models.footer", () => ctx.slots.register({
				name: "settings.models.footer",
				id: "pricing-spike2",
				order: 100,
			}, SpikeFooter));
		}
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
