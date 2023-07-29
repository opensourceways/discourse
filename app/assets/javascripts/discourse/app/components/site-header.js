import PanEvents, {
  SWIPE_DISTANCE_THRESHOLD,
  SWIPE_VELOCITY_THRESHOLD,
} from "discourse/mixins/pan-events";
import { cancel, schedule } from "@ember/runloop";
import discourseLater from "discourse-common/lib/later";
import Docking from "discourse/mixins/docking";
import MountWidget from "discourse/components/mount-widget";
import ItsATrap from "@discourse/itsatrap";
import RerenderOnDoNotDisturbChange from "discourse/mixins/rerender-on-do-not-disturb-change";
import { bind, observes } from "discourse-common/utils/decorators";
import { topicTitleDecorators } from "discourse/components/topic-title";
import { isTesting } from "discourse-common/config/environment";
import { DEBUG } from "@glimmer/env";
import { registerWaiter, unregisterWaiter } from "@ember/test";

const SiteHeaderComponent = MountWidget.extend(
  Docking,
  PanEvents,
  RerenderOnDoNotDisturbChange,
  {
    widget: "header",
    docAt: null,
    dockedHeader: null,
    _animate: false,
    _isPanning: false,
    _panMenuOrigin: "right",
    _panMenuOffset: 0,
    _scheduledRemoveAnimate: null,
    _topic: null,
    _itsatrap: null,
    _applicationElement: null,

    @observes(
      "currentUser.unread_notifications",
      "currentUser.unread_high_priority_notifications",
      "currentUser.all_unread_notifications_count",
      "currentUser.reviewable_count",
      "currentUser.unseen_reviewable_count",
      "session.defaultColorSchemeIsDark",
      "session.darkModeAvailable"
    )
    notificationsChanged() {
      this.queueRerender();
    },

    @observes("site.narrowDesktopView")
    narrowDesktopViewChanged() {
      this.eventDispatched("dom:clean", "header");

      if (this._dropDownHeaderEnabled()) {
        this.appEvents.on(
          "sidebar-hamburger-dropdown:rendered",
          this,
          "_animateMenu"
        );
      }
    },

    _animateOpening(panel) {
      let waiter;
      if (DEBUG && isTesting()) {
        waiter = () => false;
        registerWaiter(waiter);
      }

      window.requestAnimationFrame(() => {
        this._setAnimateOpeningProperties(panel);

        if (DEBUG && isTesting()) {
          unregisterWaiter(waiter);
        }
      });
    },

    _setAnimateOpeningProperties(panel) {
      const headerCloak = document.querySelector(".header-cloak");
      panel.classList.add("animate");
      headerCloak.classList.add("animate");
      this._scheduledRemoveAnimate = discourseLater(() => {
        panel.classList.remove("animate");
        headerCloak.classList.remove("animate");
      }, 200);
      panel.style.setProperty("--offset", 0);
      headerCloak.style.setProperty("--opacity", 0.5);
      this._panMenuOffset = 0;
    },

    _animateClosing(panel, menuOrigin) {
      this._animate = true;
      const headerCloak = document.querySelector(".header-cloak");
      panel.classList.add("animate");
      headerCloak.classList.add("animate");
      if (menuOrigin === "left") {
        panel.style.setProperty("--offset", `-100vw`);
      } else {
        panel.style.setProperty("--offset", `100vw`);
      }

      headerCloak.style.setProperty("--opacity", 0);
      this._scheduledRemoveAnimate = discourseLater(() => {
        panel.classList.remove("animate");
        headerCloak.classList.remove("animate");
        schedule("afterRender", () => {
          this.eventDispatched("dom:clean", "header");
          this._panMenuOffset = 0;
        });
      }, 200);
    },

    _isRTL() {
      return document.querySelector("html").classList["direction"] === "rtl";
    },

    _leftMenuClass() {
      return this._isRTL() ? "user-menu" : "hamburger-panel";
    },

    _handlePanDone(event) {
      const menuPanels = document.querySelectorAll(".menu-panel");
      const menuOrigin = this._panMenuOrigin;
      menuPanels.forEach((panel) => {
        panel.classList.remove("moving");
        if (this._shouldMenuClose(event, menuOrigin)) {
          this._animateClosing(panel, menuOrigin);
        } else {
          this._animateOpening(panel);
        }
      });
    },

    _shouldMenuClose(e, menuOrigin) {
      // menu should close after a pan either:
      // if a user moved the panel closed past a threshold and away and is NOT swiping back open
      // if a user swiped to close fast enough regardless of distance
      if (menuOrigin === "right") {
        return (
          (e.deltaX > SWIPE_DISTANCE_THRESHOLD &&
            e.velocityX > -SWIPE_VELOCITY_THRESHOLD) ||
          e.velocityX > 0
        );
      } else {
        return (
          (e.deltaX < -SWIPE_DISTANCE_THRESHOLD &&
            e.velocityX < SWIPE_VELOCITY_THRESHOLD) ||
          e.velocityX < 0
        );
      }
    },

    panStart(e) {
      const center = e.center;
      const panOverValidElement = document
        .elementsFromPoint(center.x, center.y)
        .some(
          (ele) =>
            ele.classList.contains("panel-body") ||
            ele.classList.contains("header-cloak")
        );
      if (
        panOverValidElement &&
        (e.direction === "left" || e.direction === "right")
      ) {
        e.originalEvent.preventDefault();
        this._isPanning = true;
        const panel = document.querySelector(".menu-panel");
        if (panel) {
          panel.classList.add("moving");
        }
      } else {
        this._isPanning = false;
      }
    },

    panEnd(e) {
      if (!this._isPanning) {
        return;
      }
      this._isPanning = false;
      this._handlePanDone(e);
    },

    panMove(e) {
      if (!this._isPanning) {
        return;
      }
      const panel = document.querySelector(".menu-panel");
      const headerCloak = document.querySelector(".header-cloak");
      if (this._panMenuOrigin === "right") {
        const pxClosed = Math.min(0, -e.deltaX + this._panMenuOffset);
        panel.style.setProperty("--offset", `${-pxClosed}px`);
        headerCloak.style.setProperty(
          "--opacity",
          Math.min(0.5, (300 + pxClosed) / 600)
        );
      } else {
        const pxClosed = Math.min(0, e.deltaX + this._panMenuOffset);
        panel.style.setProperty("--offset", `${pxClosed}px`);
        headerCloak.style.setProperty(
          "--opacity",
          Math.min(0.5, (300 + pxClosed) / 600)
        );
      }
    },

    dockCheck() {
      const header = this.header;

      if (this.docAt === null) {
        if (!header) {
          return;
        }
        this.docAt = header.offsetTop;
      }

      const main = (this._applicationElement ??=
        document.querySelector(".ember-application"));
      const offsetTop = main ? main.offsetTop : 0;
      const offset = window.pageYOffset - offsetTop;
      if (offset >= this.docAt) {
        if (!this.dockedHeader) {
          document.body.classList.add("docked");
          this.dockedHeader = true;
        }
      } else {
        if (this.dockedHeader) {
          document.body.classList.remove("docked");
          this.dockedHeader = false;
        }
      }
    },

    setTopic(topic) {
      this.eventDispatched("dom:clean", "header");
      this._topic = topic;
      this.queueRerender();
    },

    willRender() {
      if (this.get("currentUser.staff")) {
        document.body.classList.add("staff");
      }
    },

    didInsertElement() {
      this._super(...arguments);
      this._resizeDiscourseMenuPanel = () => this.afterRender();
      window.addEventListener("resize", this._resizeDiscourseMenuPanel);

      this.appEvents.on("header:show-topic", this, "setTopic");
      this.appEvents.on("header:hide-topic", this, "setTopic");

      this.appEvents.on("user-menu:rendered", this, "_animateMenu");

      if (this._dropDownHeaderEnabled()) {
        this.appEvents.on(
          "sidebar-hamburger-dropdown:rendered",
          this,
          "_animateMenu"
        );
      }

      this.dispatch("notifications:changed", "user-notifications");
      this.dispatch("header:keyboard-trigger", "header");
      this.dispatch("user-menu:navigation", "user-menu");

      this.appEvents.on("dom:clean", this, "_cleanDom");

      if (this.currentUser) {
        this.currentUser.on("status-changed", this, "queueRerender");
      }

      const header = document.querySelector("header.d-header");
      this._itsatrap = new ItsATrap(header);
      const dirs = ["up", "down"];
      this._itsatrap.bind(dirs, (e) => this._handleArrowKeysNav(e));
    },

    _handleArrowKeysNav(event) {
      const activeTab = document.querySelector(
        ".menu-tabs-container .btn.active"
      );
      if (activeTab) {
        let activeTabNumber = Number(
          document.activeElement.dataset.tabNumber ||
            activeTab.dataset.tabNumber
        );
        const maxTabNumber =
          document.querySelectorAll(".menu-tabs-container .btn").length - 1;
        const isNext = event.key === "ArrowDown";
        let nextTab = isNext ? activeTabNumber + 1 : activeTabNumber - 1;
        if (isNext && nextTab > maxTabNumber) {
          nextTab = 0;
        }
        if (!isNext && nextTab < 0) {
          nextTab = maxTabNumber;
        }
        event.preventDefault();
        document
          .querySelector(
            `.menu-tabs-container .btn[data-tab-number='${nextTab}']`
          )
          .focus();
      }
    },

    _cleanDom() {
      // For performance, only trigger a re-render if any menu panels are visible
      if (this.element.querySelector(".menu-panel")) {
        this.eventDispatched("dom:clean", "header");
      }
    },

    willDestroyElement() {
      this._super(...arguments);

      window.removeEventListener("resize", this._resizeDiscourseMenuPanel);

      this.appEvents.off("header:show-topic", this, "setTopic");
      this.appEvents.off("header:hide-topic", this, "setTopic");
      this.appEvents.off("dom:clean", this, "_cleanDom");
      this.appEvents.off("user-menu:rendered", this, "_animateMenu");

      if (this._dropDownHeaderEnabled()) {
        this.appEvents.off(
          "sidebar-hamburger-dropdown:rendered",
          this,
          "_animateMenu"
        );
      }

      if (this.currentUser) {
        this.currentUser.off("status-changed", this, "queueRerender");
      }

      cancel(this._scheduledRemoveAnimate);

      this._itsatrap?.destroy();
      this._itsatrap = null;
    },

    buildArgs() {
      return {
        topic: this._topic,
        canSignUp: this.canSignUp,
        sidebarEnabled: this.sidebarEnabled,
        showSidebar: this.showSidebar,
        navigationMenuQueryParamOverride: this.navigationMenuQueryParamOverride,
      };
    },

    afterRender() {
      const headerTitle = document.querySelector(".header-title .topic-link");
      if (headerTitle && this._topic) {
        topicTitleDecorators.forEach((cb) =>
          cb(this._topic, headerTitle, "header-title")
        );
      }
      this._animateMenu();
    },

    _animateMenu() {
      const menuPanels = document.querySelectorAll(".menu-panel");

      if (menuPanels.length === 0) {
        this._animate = this.site.mobileView || this.site.narrowDesktopView;
        return;
      }

      const viewMode =
        this.site.mobileView || this.site.narrowDesktopView
          ? "slide-in"
          : "drop-down";

      menuPanels.forEach((panel) => {
        const headerCloak = document.querySelector(".header-cloak");
        let width = parseInt(panel.getAttribute("data-max-width"), 10) || 300;
        if (this._panMenuOffset) {
          this._panMenuOffset = -width;
        }

        panel.classList.remove("drop-down");
        panel.classList.remove("slide-in");
        panel.classList.add(viewMode);

        if (this._animate || this._panMenuOffset !== 0) {
          if (
            (this.site.mobileView || this.site.narrowDesktopView) &&
            panel.parentElement.classList.contains(this._leftMenuClass())
          ) {
            this._panMenuOrigin = "left";
            panel.style.setProperty("--offset", `-100vw`);
          } else {
            this._panMenuOrigin = "right";
            panel.style.setProperty("--offset", `100vw`);
          }
          headerCloak.style.setProperty("--opacity", 0);
        }

        if (viewMode === "slide-in") {
          headerCloak.style.display = "block";
        }
        if (this._animate) {
          this._animateOpening(panel);
        }
        this._animate = false;
      });
    },

    _dropDownHeaderEnabled() {
      return (
        (!this.sidebarEnabled &&
          this.siteSettings.navigation_menu !== "legacy") ||
        this.site.narrowDesktopView
      );
    },
  }
);

export default SiteHeaderComponent.extend({
  classNames: ["d-header-wrap"],
  classNameBindings: ["site.mobileView::drop-down-mode"],
  headerWrap: null,
  header: null,

  init() {
    this._super(...arguments);
    this._resizeObserver = null;
  },

  @bind
  updateHeaderOffset() {
    let headerWrapTop = this.headerWrap.getBoundingClientRect().top;

    if (headerWrapTop !== 0) {
      headerWrapTop -= Math.max(0, document.body.getBoundingClientRect().top);
    }

    if (DEBUG && isTesting()) {
      headerWrapTop -= document
        .getElementById("ember-testing-container")
        .getBoundingClientRect().top;

      headerWrapTop -= 1; // For 1px border on testing container
    }

    const documentStyle = document.documentElement.style;

    const currentValue = documentStyle.getPropertyValue("--header-offset");
    const newValue = `${this.headerWrap.offsetHeight + headerWrapTop}px`;

    if (currentValue !== newValue) {
      documentStyle.setProperty("--header-offset", newValue);
    }
  },

  @bind
  onScroll() {
    schedule("afterRender", this.updateHeaderOffset);
  },

  didInsertElement() {
    this._super(...arguments);

    this.appEvents.on("site-header:force-refresh", this, "queueRerender");

    this.headerWrap = document.querySelector(".d-header-wrap");

    if (this.headerWrap) {
      schedule("afterRender", () => {
        this.header = this.headerWrap.querySelector("header.d-header");
        this.updateHeaderOffset();
        const headerTop = this.header.offsetTop;
        document.documentElement.style.setProperty(
          "--header-top",
          `${headerTop}px`
        );
      });

      window.addEventListener("scroll", this.onScroll, {
        passive: true,
      });
    }

    if ("ResizeObserver" in window) {
      this._resizeObserver = new ResizeObserver((entries) => {
        for (let entry of entries) {
          if (entry.contentRect) {
            const headerTop = this.header.offsetTop;
            document.documentElement.style.setProperty(
              "--header-top",
              `${headerTop}px`
            );
            this.updateHeaderOffset();
          }
        }
      });

      this._resizeObserver.observe(this.headerWrap);
    }
  },

  willDestroyElement() {
    this._super(...arguments);
    window.removeEventListener("scroll", this.onScroll);
    this._resizeObserver?.disconnect();
    this.appEvents.off("site-header:force-refresh", this, "queueRerender");
  },
});
