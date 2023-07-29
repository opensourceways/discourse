# frozen_string_literal: true

module PageObjects
  module Components
    module NavigationMenu
      class Base < PageObjects::Components::Base
        def community_section
          find(".sidebar-section[data-section-name='community']")
        end

        SIDEBAR_SECTION_LINK_SELECTOR = "sidebar-section-link"

        def click_section_link(name)
          find(".#{SIDEBAR_SECTION_LINK_SELECTOR}", text: name).click
        end

        def has_one_active_section_link?
          has_css?(".#{SIDEBAR_SECTION_LINK_SELECTOR}--active", count: 1)
        end

        def has_section_link?(name, href: nil, active: false, target: nil)
          section_link_present?(name, href: href, active: active, target: target, present: true)
        end

        def has_no_section_link?(name, href: nil, active: false)
          section_link_present?(name, href: href, active: active, present: false)
        end

        def has_section?(name)
          has_css?(".sidebar-sections [data-section-name='#{name.parameterize}']")
        end

        def has_no_section?(name)
          has_no_css?(".sidebar-sections [data-section-name='#{name.parameterize}']")
        end

        def has_categories_section?
          has_section?("Categories")
        end

        def has_tags_section?
          has_section?("Tags")
        end

        def has_no_tags_section?
          has_no_section?("Tags")
        end

        def has_all_tags_section_link?
          has_section_link?(I18n.t("js.sidebar.all_tags"))
        end

        def has_tag_section_links?(tags)
          tag_names = tags.map(&:name)

          tag_section_links =
            all(
              ".sidebar-section[data-section-name='tags'] .sidebar-section-link-wrapper[data-tag-name]",
              count: tag_names.length,
            )

          expect(tag_section_links.map(&:text)).to eq(tag_names)
        end

        def has_tag_section_link_with_title?(tag, title)
          section_link =
            find(
              ".sidebar-section[data-section-name='tags'] .sidebar-section-link-wrapper[data-tag-name='#{tag.name}'] .sidebar-section-link",
            )

          expect(section_link["title"]).to eq(title)
        end

        def primary_section_links(slug)
          all("[data-section-name='#{slug}'] .sidebar-section-link-wrapper").map(&:text)
        end

        def primary_section_icons(slug)
          all("[data-section-name='#{slug}'] .sidebar-section-link-wrapper use").map do |icon|
            icon[:href].delete_prefix("#")
          end
        end

        def has_category_section_link?(category)
          page.has_link?(category.name, class: "sidebar-section-link")
        end

        def click_add_section_button
          click_button(add_section_button_text)
        end

        def has_no_add_section_button?
          page.has_no_button?(add_section_button_text)
        end

        def click_edit_categories_button
          within(".sidebar-section[data-section-name='categories']") do
            click_button(class: "sidebar-section-header-button", visible: false)
          end

          PageObjects::Modals::SidebarEditCategories.new
        end

        def click_edit_tags_button
          within(".sidebar-section[data-section-name='tags']") do
            click_button(class: "sidebar-section-header-button", visible: false)
          end

          PageObjects::Modals::SidebarEditTags.new
        end

        def edit_custom_section(name)
          name = name.parameterize

          find(".sidebar-section[data-section-name='#{name}']").hover

          find(
            ".sidebar-section[data-section-name='#{name}'] button.sidebar-section-header-button",
          ).click
        end

        private

        def section_link_present?(name, href: nil, active: false, target: nil, present:)
          attributes = { exact_text: name }
          attributes[:href] = href if href
          attributes[:class] = SIDEBAR_SECTION_LINK_SELECTOR
          attributes[:class] += "--active" if active
          attributes[:target] = target if target
          page.public_send(present ? :has_link? : :has_no_link?, **attributes)
        end

        def add_section_button_text
          I18n.t("js.sidebar.sections.custom.add")
        end
      end
    end
  end
end
