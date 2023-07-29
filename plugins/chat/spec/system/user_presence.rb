# frozen_string_literal: true

RSpec.describe "User presence", type: :system do
  fab!(:channel_1) { Fabricate(:chat_channel) }
  fab!(:current_user) { Fabricate(:user) }

  let(:chat_page) { PageObjects::Pages::Chat.new }
  let(:channel) { PageObjects::Pages::ChatChannel.new }

  before do
    chat_system_bootstrap
    channel_1.add(current_user)
  end

  it "shows presence indicator" do
    sign_in(current_user)
    chat_page.visit_channel(channel_1)
    channel.send_message("Am I present?")

    expect(page).to have_css(".chat-message .chat-user-avatar.is-online")
  end

  context "when user hides presence" do
    it "hides the presence indicator" do
      current_user.user_option.update!(hide_profile_and_presence: true)
      sign_in(current_user)
      chat_page.visit_channel(channel_1)
      channel.send_message("Am I present?")

      expect(page).to have_no_css(".chat-user-avatar.is-online")
    end
  end
end
