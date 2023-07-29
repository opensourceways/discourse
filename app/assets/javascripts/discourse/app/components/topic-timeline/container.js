import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { action } from "@ember/object";
import I18n from "I18n";
import { htmlSafe } from "@ember/template";
import { inject as service } from "@ember/service";
import { bind, debounce } from "discourse-common/utils/decorators";
import { actionDescriptionHtml } from "discourse/widgets/post-small-action";
import domUtils from "discourse-common/utils/dom-utils";
import { headerOffset } from "discourse/lib/offset-calculator";

export const SCROLLER_HEIGHT = 50;
const MIN_SCROLLAREA_HEIGHT = 170;
const MAX_SCROLLAREA_HEIGHT = 300;
const LAST_READ_HEIGHT = 20;

export default class TopicTimelineScrollArea extends Component {
  @service appEvents;
  @service siteSettings;
  @service currentUser;

  @tracked showButton = false;
  @tracked current;
  @tracked percentage = this._percentFor(
    this.args.model,
    this.args.enteredIndex
  );
  @tracked total;
  @tracked date;
  @tracked lastReadPercentage = null;
  @tracked lastRead;
  @tracked lastReadTop;
  @tracked before;
  @tracked after;
  @tracked timelineScrollareaStyle;
  @tracked dragging = false;
  @tracked excerpt = "";

  intersectionObserver = null;

  constructor() {
    super(...arguments);

    if (!this.args.mobileView) {
      // listen for scrolling event to update timeline
      this.appEvents.on("topic:current-post-scrolled", this.postScrolled);
      // listen for composer sizing changes to update timeline
      this.appEvents.on("composer:opened", this.calculatePosition);
      this.appEvents.on("composer:resized", this.calculatePosition);
      this.appEvents.on("composer:closed", this.calculatePosition);
      this.appEvents.on("post-stream:posted", this.calculatePosition);
    }

    this.intersectionObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const bounds = entry.boundingClientRect;

        if (entry.target.id === "topic-bottom") {
          this.topicBottom = bounds.y + window.scrollY;
        } else {
          this.topicTop = bounds.y + window.scrollY;
        }
      }
    });

    const elements = [
      document.querySelector(".container.posts"),
      document.querySelector("#topic-bottom"),
    ];

    for (let i = 0; i < elements.length; i++) {
      this.intersectionObserver.observe(elements[i]);
    }

    this.calculatePosition();
    this.dockCheck();
  }

  get displaySummary() {
    return (
      this.siteSettings.summary_timeline_button &&
      !this.args.fullScreen &&
      this.args.model.has_summary &&
      !this.args.model.postStream.summary
    );
  }

  get displayTimeLineScrollArea() {
    if (this.args.mobileView) {
      return true;
    }

    if (this.total === 1) {
      const postsWrapper = document.querySelector(".posts-wrapper");
      if (postsWrapper && postsWrapper.offsetHeight < 1000) {
        return false;
      }
    }

    return true;
  }

  get canCreatePost() {
    return this.args.model.details?.can_create_post;
  }

  get topicTitle() {
    return htmlSafe(this.args.mobileView ? this.args.model.fancyTitle : "");
  }

  get showTags() {
    return (
      this.siteSettings.tagging_enabled && this.args.model.tags?.length > 0
    );
  }

  get style() {
    return htmlSafe(`height: ${scrollareaHeight()}px`);
  }

  get beforePadding() {
    return htmlSafe(`height: ${this.before}px`);
  }

  get afterPadding() {
    return htmlSafe(`height: ${this.after}px`);
  }

  get showDockedButton() {
    return !this.args.mobileView && this.hasBackPosition && !this.showButton;
  }

  get hasBackPosition() {
    return (
      this.lastRead &&
      this.lastRead > 3 &&
      this.lastRead > this.current &&
      Math.abs(this.lastRead - this.current) > 3 &&
      Math.abs(this.lastRead - this.total) > 1 &&
      this.lastRead !== this.total
    );
  }

  get lastReadStyle() {
    return htmlSafe(
      `height: ${LAST_READ_HEIGHT}px; top: ${this.topPosition}px`
    );
  }

  get topPosition() {
    const bottom = scrollareaHeight() - LAST_READ_HEIGHT / 2;
    return this.lastReadTop > bottom ? bottom : this.lastReadTop;
  }

  get startDate() {
    return timelineDate(this.args.model.createdAt);
  }

  get nowDateOptions() {
    return {
      addAgo: true,
      defaultFormat: timelineDate,
    };
  }

  get nowDate() {
    return (
      this.args.model.get("last_posted_at") || this.args.model.get("created_at")
    );
  }

  get lastReadHeight() {
    return Math.round(this.lastReadPercentage * scrollareaHeight());
  }

  @bind
  calculatePosition() {
    this.timelineScrollareaStyle = htmlSafe(`height: ${scrollareaHeight()}px`);

    const topic = this.args.model;
    const postStream = topic.postStream;
    this.total = postStream.filteredPostsCount;

    this.scrollPosition =
      this.clamp(Math.floor(this.total * this.percentage), 0, this.total) + 1;

    this.current = this.clamp(this.scrollPosition, 1, this.total);
    const daysAgo = postStream.closestDaysAgoFor(this.current);

    let date;
    if (daysAgo === undefined) {
      const post = postStream.posts.findBy(
        "id",
        postStream.stream[this.current]
      );

      if (post) {
        date = new Date(post.created_at);
      }
    } else if (daysAgo !== null) {
      date = new Date();
      date.setDate(date.getDate() - daysAgo || 0);
    } else {
      date = null;
    }

    this.date = date;

    const lastReadNumber = topic.last_read_post_number;
    const lastReadId = topic.last_read_post_id;

    if (lastReadId && lastReadNumber) {
      const idx = postStream.stream.indexOf(lastReadId) + 1;
      this.lastRead = idx;
      this.lastReadPercentage = this._percentFor(topic, idx);
    }

    if (this.position !== this.scrollPosition) {
      this.position = this.scrollPosition;
      this.updateScrollPosition(this.current);
    }

    this.before = this.scrollareaRemaining() * this.percentage;
    this.after = scrollareaHeight() - this.before - SCROLLER_HEIGHT;

    if (this.percentage === null) {
      return;
    }

    if (this.hasBackPosition) {
      this.lastReadTop = Math.round(
        this.lastReadPercentage * scrollareaHeight()
      );
      this.showButton =
        this.before + SCROLLER_HEIGHT - 5 < this.lastReadTop ||
        this.before > this.lastReadTop + 25;
    }
  }

  @debounce(50)
  updateScrollPosition(scrollPosition) {
    // only ran on mobile
    if (!this.args.fullscreen) {
      return;
    }

    const stream = this.args.model.postStream;

    if (!this.position === scrollPosition) {
      return;
    }

    // we have an off by one, stream is zero based,
    stream.excerpt(scrollPosition - 1).then((info) => {
      if (info && this.position === scrollPosition) {
        let excerpt = "";
        if (info.username) {
          excerpt = "<span class='username'>" + info.username + ":</span> ";
        }
        if (info.excerpt) {
          this.excerpt = excerpt + info.excerpt;
        } else if (info.action_code) {
          this.excerpt = `${excerpt} ${actionDescriptionHtml(
            info.action_code,
            info.created_at,
            info.username
          )}`;
        }
      }
    });
  }

  @bind
  updatePercentage(e) {
    // pageY for mouse and mobile
    const y = e.pageY || e.touches[0].pageY;
    const area = document.querySelector(".timeline-scrollarea");
    const areaTop = domUtils.offset(area).top;

    this.percentage = this.clamp(parseFloat(y - areaTop) / area.offsetHeight);
    this.commit();
  }

  @bind
  didStartDrag() {
    this.dragging = true;
  }

  @bind
  dragMove(event) {
    event.stopPropagation();
    event.preventDefault();
    this.updatePercentage(event);
  }

  @bind
  didEndDrag() {
    this.dragging = false;
    this.commit();
  }

  @bind
  postScrolled(e) {
    this.current = e.postIndex;
    this.percentage = e.percent;
    this.calculatePosition();
    this.dockCheck();
  }

  @action
  goBack() {
    this.args.jumpToIndex(this.lastRead);
  }

  dockCheck() {
    const timeline = document.querySelector(".timeline-container");
    const timelineHeight = (timeline && timeline.offsetHeight) || 400;

    const prevDockAt = this.dockAt;
    const positionTop = headerOffset() + window.pageYOffset;
    const currentPosition = positionTop + timelineHeight;

    this.dockBottom = false;
    if (positionTop < this.topicTop) {
      this.dockAt = parseInt(this.topicTop, 10);
    } else if (currentPosition > this.topicBottom) {
      this.dockAt = parseInt(this.topicBottom - timelineHeight, 10);
      this.dockBottom = true;
      if (this.dockAt < 0) {
        this.dockAt = 0;
      }
    } else {
      this.dockAt = null;
    }

    if (this.dockAt !== prevDockAt) {
      if (this.dockAt) {
        this.args.setDocked(true);
        if (this.dockBottom) {
          this.args.setDockedBottom(true);
        }
      } else {
        this.args.setDocked(false);
        this.args.setDockedBottom(false);
      }
    }
  }

  commit() {
    this.calculatePosition();

    if (!this.dragging) {
      if (this.current === this.scrollPosition) {
        this.args.jumpToIndex(this.current);
      } else {
        this.args.jumpEnd();
      }
    }
  }

  clamp(p, min = 0.0, max = 1.0) {
    return Math.max(Math.min(p, max), min);
  }

  scrollareaRemaining() {
    return scrollareaHeight() - SCROLLER_HEIGHT;
  }

  willDestroy() {
    if (!this.args.mobileView) {
      this.intersectionObserver?.disconnect();
      this.intersectionObserver = null;

      this.appEvents.off("composer:opened", this.calculatePosition);
      this.appEvents.off("composer:resized", this.calculatePosition);
      this.appEvents.off("composer:closed", this.calculatePosition);
      this.appEvents.off("topic:current-post-scrolled", this.postScrolled);
      this.appEvents.off("post-stream:posted", this.calculatePosition);
    }
  }

  _percentFor(topic, postIndex) {
    const total = topic.postStream.filteredPostsCount;
    switch (postIndex) {
      // if first post, no top padding
      case 0:
        return 0;
      // if last, no bottom padding
      case total - 1:
        return 1;
      // otherwise, calculate
      default:
        return this.clamp(parseFloat(postIndex) / total);
    }
  }
}

export function scrollareaHeight() {
  const composerHeight =
      document.getElementById("reply-control").offsetHeight || 0,
    headerHeight = document.querySelector(".d-header")?.offsetHeight || 0;

  // scrollarea takes up about half of the timeline's height
  const availableHeight =
    (window.innerHeight - composerHeight - headerHeight) / 2;

  return Math.max(
    MIN_SCROLLAREA_HEIGHT,
    Math.min(availableHeight, MAX_SCROLLAREA_HEIGHT)
  );
}

export function timelineDate(date) {
  const fmt =
    date.getFullYear() === new Date().getFullYear()
      ? "long_no_year_no_time"
      : "timeline_date";
  return moment(date).format(I18n.t(`dates.${fmt}`));
}
