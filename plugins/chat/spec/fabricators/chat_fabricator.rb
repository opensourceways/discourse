# frozen_string_literal: true

Fabricator(:chat_channel, class_name: "Chat::Channel") do
  name do
    sequence(:name) do |n|
      random_name = [
        "Gaming Lounge",
        "Music Lodge",
        "Random",
        "Politics",
        "Sports Center",
        "Kino Buffs",
      ].sample
      "#{random_name} #{n}"
    end
  end
  chatable { Fabricate(:category) }
  type do |attrs|
    if attrs[:chatable_type] == "Category" || attrs[:chatable]&.is_a?(Category)
      "CategoryChannel"
    else
      "DirectMessageChannel"
    end
  end
  status { :open }
end

Fabricator(:category_channel, from: :chat_channel) {}

Fabricator(:private_category_channel, from: :category_channel) do
  transient :group
  chatable { |attrs| Fabricate(:private_category, group: attrs[:group] || Group[:staff]) }
end

Fabricator(:direct_message_channel, from: :chat_channel) do
  transient :users, following: true, with_membership: true
  chatable do |attrs|
    Fabricate(:direct_message, users: attrs[:users] || [Fabricate(:user), Fabricate(:user)])
  end
  status { :open }
  name nil
  after_create do |channel, attrs|
    if attrs[:with_membership]
      channel.chatable.users.each do |user|
        membership = channel.add(user)
        membership.update!(following: false) if attrs[:following] == false
      end
    end
  end
end

Fabricator(:chat_message, class_name: "Chat::MessageCreator") do
  transient :chat_channel
  transient :user
  transient :message
  transient :in_reply_to
  transient :thread
  transient :upload_ids

  initialize_with do |transients|
    user = transients[:user] || Fabricate(:user)
    channel =
      transients[:chat_channel] || transients[:thread]&.channel ||
        transients[:in_reply_to]&.chat_channel || Fabricate(:chat_channel)

    resolved_class.create(
      chat_channel: channel,
      user: user,
      content: transients[:message] || Faker::Lorem.paragraph_by_chars(number: 500),
      thread_id: transients[:thread]&.id,
      in_reply_to_id: transients[:in_reply_to]&.id,
      upload_ids: transients[:upload_ids],
    ).chat_message
  end
end

Fabricator(:chat_mention, class_name: "Chat::Mention") do
  transient read: false
  transient high_priority: true
  transient identifier: :direct_mentions

  user { Fabricate(:user) }
  chat_message { Fabricate(:chat_message) }
end

Fabricator(:chat_message_reaction, class_name: "Chat::MessageReaction") do
  chat_message { Fabricate(:chat_message) }
  user { Fabricate(:user) }
  emoji { %w[+1 tada heart joffrey_facepalm].sample }
  after_build do |chat_message_reaction|
    chat_message_reaction.chat_message.chat_channel.add(chat_message_reaction.user)
  end
end

Fabricator(:chat_message_revision, class_name: "Chat::MessageRevision") do
  chat_message { Fabricate(:chat_message) }
  old_message { "something old" }
  new_message { "something new" }
  user { |attrs| attrs[:chat_message].user }
end

Fabricator(:chat_reviewable_message, class_name: "Chat::ReviewableMessage") do
  reviewable_by_moderator true
  type "ReviewableChatMessage"
  created_by { Fabricate(:user) }
  target { Fabricate(:chat_message) }
  reviewable_scores { |p| [Fabricate.build(:reviewable_score, reviewable_id: p[:id])] }
end

Fabricator(:direct_message, class_name: "Chat::DirectMessage") do
  users { [Fabricate(:user), Fabricate(:user)] }
end

Fabricator(:chat_webhook_event, class_name: "Chat::WebhookEvent") do
  chat_message { Fabricate(:chat_message) }
  incoming_chat_webhook do |attrs|
    Fabricate(:incoming_chat_webhook, chat_channel: attrs[:chat_message].chat_channel)
  end
end

Fabricator(:incoming_chat_webhook, class_name: "Chat::IncomingWebhook") do
  name { sequence(:name) { |i| "#{i + 1}" } }
  key { sequence(:key) { |i| "#{i + 1}" } }
  chat_channel { Fabricate(:chat_channel, chatable: Fabricate(:category)) }
end

Fabricator(:user_chat_channel_membership, class_name: "Chat::UserChatChannelMembership") do
  user
  chat_channel
  following true
end

Fabricator(:user_chat_channel_membership_for_dm, from: :user_chat_channel_membership) do
  user
  chat_channel
  following true
  desktop_notification_level 2
  mobile_notification_level 2
end

Fabricator(:chat_draft, class_name: "Chat::Draft") do
  user
  chat_channel

  transient :value, "chat draft message"
  transient :uploads, []
  transient :reply_to_msg

  data do |attrs|
    { value: attrs[:value], replyToMsg: attrs[:reply_to_msg], uploads: attrs[:uploads] }.to_json
  end
end

Fabricator(:chat_thread, class_name: "Chat::Thread") do
  before_create do |thread, transients|
    thread.original_message_user = original_message.user
    thread.channel = original_message.chat_channel
  end

  transient :with_replies
  transient :channel
  transient :original_message_user
  transient :old_om

  original_message do |attrs|
    Fabricate(
      :chat_message,
      chat_channel: attrs[:channel] || Fabricate(:chat_channel),
      user: attrs[:original_message_user] || Fabricate(:user),
    )
  end

  after_create do |thread, transients|
    attrs = { thread_id: thread.id }

    # Sometimes we  make this older via created_at so any messages fabricated for this thread
    # afterwards are not created earlier in time than the OM.
    attrs[:created_at] = 1.week.ago if transients[:old_om]

    thread.original_message.update!(**attrs)
    thread.add(thread.original_message_user)

    if transients[:with_replies]
      Fabricate.times(transients[:with_replies], :chat_message, thread: thread)
    end
  end
end

Fabricator(:user_chat_thread_membership, class_name: "Chat::UserChatThreadMembership") do
  user
  after_create do |membership|
    Chat::UserChatChannelMembership.find_or_create_by!(
      user: membership.user,
      chat_channel: membership.thread.channel,
    ).update!(following: true)
  end
end
