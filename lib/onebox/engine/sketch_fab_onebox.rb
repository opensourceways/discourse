# frozen_string_literal: true

module Onebox
  module Engine
    class SketchFabOnebox
      include Engine
      include StandardEmbed

      matches_domain("sketchfab.com")
      always_https
      requires_iframe_origins("https://sketchfab.com")

      def self.matches_path(path)
        path.match?(%r{^/(models/|3d-models/[^/\s]+-)?[a-z0-9]{32}})
      end

      def to_html
        og = get_opengraph
        src = og.video_url.gsub("autostart=1", "")

        <<-HTML
          <iframe
            src="#{src}"
            width="#{og.video_width}"
            height="#{og.video_height}"
            scrolling="no"
            frameborder="0"
            allowfullscreen
          ></iframe>
        HTML
      end

      def placeholder_html
        "<img src='#{get_opengraph.image}'>"
      end
    end
  end
end
