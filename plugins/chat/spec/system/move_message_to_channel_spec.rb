# frozen_string_literal: true

RSpec.describe "Move message to channel", type: :system do
  let(:chat_page) { PageObjects::Pages::Chat.new }
  let(:channel_page) { PageObjects::Pages::ChatChannel.new }

  before { chat_system_bootstrap }

  context "when user" do
    fab!(:current_user) { Fabricate(:user) }
    fab!(:channel_1) { Fabricate(:chat_channel) }
    fab!(:message_1) { Fabricate(:chat_message, chat_channel: channel_1, user: current_user) }

    before do
      sign_in(current_user)
      channel_1.add(current_user)
    end

    it "is not available" do
      chat_page.visit_channel(channel_1)
      channel_page.messages.select(message_1)

      expect(channel_page.selection_management).to have_no_move_action
    end

    context "when can moderate channel" do
      fab!(:group_1) { Fabricate(:group) }
      fab!(:channel_1) { Fabricate(:private_category_channel, group: group_1) }
      fab!(:message_1) { Fabricate(:chat_message, chat_channel: channel_1, user: current_user) }

      before do
        SiteSetting.enable_category_group_moderation = true
        group_1.add(current_user)
        channel_1.add(current_user)
        channel_1.chatable.update!(reviewable_by_group_id: group_1.id)
      end

      it "is available" do
        chat_page.visit_channel(channel_1)
        channel_page.messages.select(message_1)

        expect(channel_page.selection_management).to have_move_action
      end
    end
  end

  context "when admin" do
    fab!(:current_admin_user) { Fabricate(:admin) }

    before { sign_in(current_admin_user) }

    context "when dm channel" do
      fab!(:dm_channel_1) { Fabricate(:direct_message_channel, users: [current_admin_user]) }
      fab!(:message_1) do
        Fabricate(:chat_message, chat_channel: dm_channel_1, user: current_admin_user)
      end

      it "is not available" do
        chat_page.visit_channel(dm_channel_1)
        channel_page.messages.select(message_1)

        expect(channel_page.selection_management).to have_no_move_action
      end
    end

    context "when category channel" do
      fab!(:channel_1) { Fabricate(:chat_channel) }
      fab!(:channel_2) { Fabricate(:chat_channel) }
      fab!(:message_1) do
        Fabricate(:chat_message, chat_channel: channel_1, user: current_admin_user)
      end

      before do
        channel_1.add(current_admin_user)
        channel_2.add(current_admin_user)
      end

      it "moves the message" do
        chat_page.visit_channel(channel_1)
        channel_page.messages.select(message_1)
        channel_page.selection_management.move
        find(".chat-modal-move-message-to-channel__channel-chooser").click
        find("[data-value='#{channel_2.id}']").click
        click_button(I18n.t("js.chat.move_to_channel.confirm_move"))

        expect(page).to have_current_path(chat.channel_path(channel_2.slug, channel_2.id))
        expect(channel_page.messages).to have_message(text: message_1.message)

        chat_page.visit_channel(channel_1)

        expect(channel_page.messages).to have_deleted_message(message_1)
      end
    end
  end
end
