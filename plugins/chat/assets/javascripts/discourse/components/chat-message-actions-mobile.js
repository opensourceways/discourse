import Component from "@glimmer/component";
import ChatMessageInteractor from "discourse/plugins/chat/discourse/lib/chat-message-interactor";
import { getOwner } from "discourse-common/lib/get-owner";
import { tracked } from "@glimmer/tracking";
import discourseLater from "discourse-common/lib/later";
import { action } from "@ember/object";
import { isTesting } from "discourse-common/config/environment";
import { inject as service } from "@ember/service";

export default class ChatMessageActionsMobile extends Component {
  @service chat;
  @service site;
  @service capabilities;

  @tracked hasExpandedReply = false;
  @tracked showFadeIn = false;

  get message() {
    return this.chat.activeMessage.model;
  }

  get context() {
    return this.chat.activeMessage.context;
  }

  get messageInteractor() {
    return new ChatMessageInteractor(
      getOwner(this),
      this.message,
      this.context
    );
  }

  @action
  fadeAndVibrate() {
    discourseLater(this.#addFadeIn.bind(this));

    if (this.capabilities.canVibrate && !isTesting()) {
      navigator.vibrate(5);
    }
  }

  @action
  expandReply(event) {
    event.stopPropagation();
    this.hasExpandedReply = true;
  }

  @action
  collapseMenu(event) {
    event.preventDefault();
    this.#onCloseMenu();
  }

  @action
  actAndCloseMenu(fnId) {
    this.messageInteractor[fnId]();
    this.#onCloseMenu();
  }

  @action
  openEmojiPicker(_, event) {
    this.messageInteractor.openEmojiPicker(_, event);
    this.#onCloseMenu();
  }

  #onCloseMenu() {
    this.#removeFadeIn();

    // we don't want to remove the component right away as it's animating
    // 200 is equal to the duration of the css animation
    discourseLater(() => {
      if (this.isDestroying || this.isDestroyed) {
        return;
      }

      // by ensuring we are not hovering any message anymore
      // we also ensure the menu is fully removed
      this.chat.activeMessage = null;
    }, 200);
  }

  #addFadeIn() {
    this.showFadeIn = true;
  }

  #removeFadeIn() {
    this.showFadeIn = false;
  }
}
