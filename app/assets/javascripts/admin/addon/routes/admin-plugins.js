import { action } from "@ember/object";
import Route from "@ember/routing/route";
import { inject as service } from "@ember/service";

export default class AdminPluginsRoute extends Route {
  @service router;

  model() {
    return this.store.findAll("plugin");
  }

  @action
  showSettings(plugin) {
    const controller = this.controllerFor("adminSiteSettings");
    this.router
      .transitionTo("adminSiteSettingsCategory", "plugins")
      .then(() => {
        if (plugin) {
          // filterContent() is normally on a debounce from typing.
          // Because we don't want the default of "All Results", we tell it
          // to skip the next debounce.
          controller.set("filter", `plugin:${plugin.id}`);
          controller.set("_skipBounce", true);
          controller.filterContentNow("plugins");
        }
      });
  }
}
