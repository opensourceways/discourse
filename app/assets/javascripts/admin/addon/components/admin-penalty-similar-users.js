import Component from "@ember/component";
import { action } from "@ember/object";
import discourseComputed from "discourse-common/utils/decorators";

export default Component.extend({
  tagName: "",

  @discourseComputed("penaltyType")
  penaltyField(penaltyType) {
    if (penaltyType === "suspend") {
      return "can_be_suspended";
    } else if (penaltyType === "silence") {
      return "can_be_silenced";
    }
  },

  @action
  selectUserId(userId, event) {
    if (!this.selectedUserIds) {
      return;
    }

    if (event.target.checked) {
      this.selectedUserIds.pushObject(userId);
    } else {
      this.selectedUserIds.removeObject(userId);
    }
  },
});
