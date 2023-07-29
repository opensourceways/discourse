import { action } from "@ember/object";
import Controller from "@ember/controller";
import discourseComputed from "discourse-common/utils/decorators";
import discourseDebounce from "discourse-common/lib/debounce";
import { inject as service } from "@ember/service";
let lastSearch;

export default class AdminSiteTextIndexController extends Controller {
  @service router;
  @service siteSettings;

  searching = false;
  siteTexts = null;
  preferred = false;
  queryParams = ["q", "overridden", "outdated", "locale"];
  locale = null;
  q = null;
  overridden = false;
  outdated = false;

  init() {
    super.init(...arguments);

    this.set("locale", this.siteSettings.default_locale);
  }

  _performSearch() {
    this.store
      .find(
        "site-text",
        this.getProperties("q", "overridden", "outdated", "locale")
      )
      .then((results) => {
        this.set("siteTexts", results);
      })
      .finally(() => this.set("searching", false));
  }

  @discourseComputed()
  availableLocales() {
    return JSON.parse(this.siteSettings.available_locales);
  }

  @discourseComputed("locale")
  fallbackLocaleFullName() {
    if (this.siteTexts.extras.fallback_locale) {
      return this.availableLocales.find((l) => {
        return l.value === this.siteTexts.extras.fallback_locale;
      }).name;
    }
  }

  @action
  edit(siteText) {
    this.router.transitionTo("adminSiteText.edit", siteText.get("id"), {
      queryParams: {
        locale: this.locale,
      },
    });
  }

  @action
  toggleOverridden() {
    this.toggleProperty("overridden");
    this.set("searching", true);
    discourseDebounce(this, this._performSearch, 400);
  }

  @action
  toggleOutdated() {
    this.toggleProperty("outdated");
    this.set("searching", true);
    discourseDebounce(this, this._performSearch, 400);
  }

  @action
  search() {
    const q = this.q;
    if (q !== lastSearch) {
      this.set("searching", true);
      discourseDebounce(this, this._performSearch, 400);
      lastSearch = q;
    }
  }

  @action
  updateLocale(value) {
    this.setProperties({
      searching: true,
      locale: value,
    });

    discourseDebounce(this, this._performSearch, 400);
  }
}
