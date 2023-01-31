# frozen_string_literal: true

RSpec.describe "Navigation", type: :system, js: true do
  fab!(:category) { Fabricate(:category) }
  fab!(:topic) { Fabricate(:topic) }
  fab!(:post) { Fabricate(:post, topic: topic) }
  fab!(:user) { Fabricate(:admin) }
  fab!(:category_channel) { Fabricate(:category_channel) }
  fab!(:category_channel_2) { Fabricate(:category_channel) }
  let(:chat_page) { PageObjects::Pages::Chat.new }

  before do
    chat_system_bootstrap(user, [category_channel, category_channel_2])
    sign_in(user)
    SiteSetting.navigation_menu = "legacy"
  end

  it "uses chat (not core) sidebar" do
    visit("/chat")

    expect(page).to have_css(".channels-list")
    expect(page).to have_no_css("#d-sidebar")
  end

  context "when sidebar is enabled as the navigation menu" do
    before { SiteSetting.navigation_menu = "sidebar" }

    it "uses core sidebar" do
      visit("/chat")

      expect(page).to have_css("#d-sidebar")
      expect(page).to have_no_css(".channels-list")
    end

    context "when visiting on mobile" do
      it "has no sidebar" do
        visit("/?mobile_view=1")
        chat_page.visit_channel(category_channel_2)

        expect(page).to have_no_css("#d-sidebar")
      end
    end
  end

  context "when visiting on mobile" do
    it "has no sidebar" do
      visit("/?mobile_view=1")
      chat_page.visit_channel(category_channel_2)

      expect(page).to have_no_css(".channels-list")
    end
  end
end
