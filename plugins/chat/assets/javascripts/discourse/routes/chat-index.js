import DiscourseRoute from "discourse/routes/discourse";
import { inject as service } from "@ember/service";

export default class ChatIndexRoute extends DiscourseRoute {
  @service chat;
  @service chatChannelsManager;
  @service router;

  activate() {
    this.chat.activeChannel = null;
  }

  redirect() {
    // Always want the channel index on mobile.
    if (this.site.mobileView) {
      return;
    }

    // We are on desktop. Check for a channel to enter and transition if so
    const id = this.chat.getIdealFirstChannelId();
    if (id) {
      return this.chatChannelsManager.find(id).then((c) => {
        return this.router.replaceWith("chat.channel", ...c.routeModels);
      });
    } else {
      return this.router.replaceWith("chat.browse");
    }
  }

  model() {
    if (this.site.mobileView) {
      return this.chatChannelsManager.channels;
    }
  }
}
