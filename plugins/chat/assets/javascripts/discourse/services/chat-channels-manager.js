import Service, { inject as service } from "@ember/service";
import { debounce } from "discourse-common/utils/decorators";
import Promise from "rsvp";
import ChatChannel from "discourse/plugins/chat/discourse/models/chat-channel";
import { tracked } from "@glimmer/tracking";
import { TrackedObject } from "@ember-compat/tracked-built-ins";
import { popupAjaxError } from "discourse/lib/ajax-error";

const DIRECT_MESSAGE_CHANNELS_LIMIT = 20;

/*
  The ChatChannelsManager service is responsible for managing the loaded chat channels.
  It provides helpers to facilitate using and managing loaded channels instead of constantly
  fetching them from the server.
*/

export default class ChatChannelsManager extends Service {
  @service chatSubscriptionsManager;
  @service chatApi;
  @service currentUser;
  @tracked _cached = new TrackedObject();

  async find(id, options = { fetchIfNotFound: true }) {
    const existingChannel = this.#findStale(id);
    if (existingChannel) {
      return Promise.resolve(existingChannel);
    } else if (options.fetchIfNotFound) {
      return this.#find(id);
    } else {
      return Promise.resolve();
    }
  }

  get channels() {
    return Object.values(this._cached);
  }

  store(channelObject, options = {}) {
    let model;

    if (!options.replace) {
      model = this.#findStale(channelObject.id);
    }

    if (!model) {
      if (channelObject instanceof ChatChannel) {
        model = channelObject;
      } else {
        model = ChatChannel.create(channelObject);
      }
      this.#cache(model);
    }

    if (
      channelObject.meta?.message_bus_last_ids?.channel_message_bus_last_id !==
      undefined
    ) {
      model.channelMessageBusLastId =
        channelObject.meta.message_bus_last_ids.channel_message_bus_last_id;
    }

    return model;
  }

  async follow(model) {
    this.chatSubscriptionsManager.startChannelSubscription(model);

    if (!model.currentUserMembership.following) {
      return this.chatApi.followChannel(model.id).then((membership) => {
        model.currentUserMembership = membership;
        return model;
      });
    } else {
      return model;
    }
  }

  async unfollow(model) {
    this.chatSubscriptionsManager.stopChannelSubscription(model);

    return this.chatApi.unfollowChannel(model.id).then((membership) => {
      model.currentUserMembership = membership;

      return model;
    });
  }

  @debounce(300)
  async markAllChannelsRead() {
    // The user tracking state for each channel marked read will be propagated by MessageBus
    return this.chatApi.markAllChannelsAsRead();
  }

  remove(model) {
    this.chatSubscriptionsManager.stopChannelSubscription(model);
    delete this._cached[model.id];
  }

  get allChannels() {
    return [...this.publicMessageChannels, ...this.directMessageChannels].sort(
      (a, b) => {
        return b?.currentUserMembership?.lastViewedAt?.localeCompare?.(
          a?.currentUserMembership?.lastViewedAt
        );
      }
    );
  }

  get publicMessageChannels() {
    return this.channels
      .filter(
        (channel) =>
          channel.isCategoryChannel && channel.currentUserMembership.following
      )
      .sort((a, b) => a?.slug?.localeCompare?.(b?.slug));
  }

  get directMessageChannels() {
    return this.#sortDirectMessageChannels(
      this.channels.filter((channel) => {
        const membership = channel.currentUserMembership;
        return channel.isDirectMessageChannel && membership.following;
      })
    );
  }

  get truncatedDirectMessageChannels() {
    return this.directMessageChannels.slice(0, DIRECT_MESSAGE_CHANNELS_LIMIT);
  }

  async #find(id) {
    return this.chatApi
      .channel(id)
      .catch(popupAjaxError)
      .then((result) => {
        return this.store(result.channel);
      });
  }

  #cache(channel) {
    if (!channel) {
      return;
    }

    this._cached[channel.id] = channel;
  }

  #findStale(id) {
    return this._cached[id];
  }

  #sortDirectMessageChannels(channels) {
    return channels.sort((a, b) => {
      if (!a.lastMessage) {
        return 1;
      }

      if (!b.lastMessage) {
        return -1;
      }

      if (a.tracking.unreadCount === b.tracking.unreadCount) {
        return new Date(a.lastMessage.createdAt) >
          new Date(b.lastMessage.createdAt)
          ? -1
          : 1;
      } else {
        return a.tracking.unreadCount > b.tracking.unreadCount ? -1 : 1;
      }
    });
  }
}
