# frozen_string_literal: true

module Chat
  # Service responsible for completely leaving a channel,
  # which does something different depending on the channel:
  #
  # Category channels - Unfollows the channel similar to
  # behaviour of Chat::UnfollowChannel
  # DM channels with 2 users - Same as category channel
  # DM channels with > 2 users (group DM) - Deletes the user's
  # membership and removes them from the channel's user list.
  #
  # @example
  #  ::Chat::LeaveChannel.call(
  #    guardian: guardian,
  #    params: {
  #      channel_id: 1,
  #    }
  #  )
  #
  class LeaveChannel
    include Service::Base

    # @!method self.call(guardian:, params:)
    #   @param [Guardian] guardian
    #   @param [Hash] params
    #   @option params [Integer] :channel_id ID of the channel
    #   @return [Service::Base::Context]

    params do
      attribute :channel_id, :integer

      validates :channel_id, presence: true
    end

    model :channel
    step :leave
    step :recompute_users_count

    private

    def fetch_channel(params:)
      Chat::Channel.find_by(id: params.channel_id)
    end

    def leave(channel:, guardian:)
      channel.leave(guardian.user)
    end

    def recompute_users_count(channel:)
      channel.update!(
        user_count: ::Chat::ChannelMembershipsQuery.count(channel),
        user_count_stale: false,
      )
    end
  end
end
