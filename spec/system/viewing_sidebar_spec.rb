# frozen_string_literal: true

describe "Viewing sidebar", type: :system, js: true do
  fab!(:admin) { Fabricate(:admin) }
  fab!(:user) { Fabricate(:user) }
  fab!(:category_sidebar_section_link) { Fabricate(:category_sidebar_section_link, user: user) }

  describe "when using the legacy navigation menu" do
    before { SiteSetting.navigation_menu = "legacy" }

    it "should display the sidebar when `enable_sidebar` query param is '1'" do
      sign_in(user)

      visit("/latest?enable_sidebar=1")

      sidebar = PageObjects::Components::Sidebar.new

      expect(sidebar).to be_visible
      expect(sidebar).to have_category_section_link(category_sidebar_section_link.linkable)
    end
  end
end
