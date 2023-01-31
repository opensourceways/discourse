# frozen_string_literal: true

RSpec.describe Email::MessageIdService do
  fab!(:topic) { Fabricate(:topic) }
  fab!(:post) { Fabricate(:post, topic: topic) }
  fab!(:second_post) { Fabricate(:post, topic: topic) }

  subject { described_class }

  describe "#generate_for_post" do
    it "generates for the post using the message_id on the post's incoming_email" do
      Fabricate(:incoming_email, message_id: "test@test.localhost", post: post)
      post.reload
      expect(subject.generate_for_post(post, use_incoming_email_if_present: true)).to eq(
        "<test@test.localhost>",
      )
    end

    it "generates for the post without an incoming_email record" do
      expect(subject.generate_for_post(post)).to match(subject.message_id_post_id_regexp)
      expect(subject.generate_for_post(post, use_incoming_email_if_present: true)).to match(
        subject.message_id_post_id_regexp,
      )
    end
  end

  describe "#generate_for_topic" do
    it "generates for the topic using the message_id on the first post's incoming_email" do
      Fabricate(
        :incoming_email,
        message_id: "test213428@somemailservice.com",
        post: post,
        created_via: IncomingEmail.created_via_types[:handle_mail],
      )
      post.reload
      expect(subject.generate_for_topic(topic, use_incoming_email_if_present: true)).to eq(
        "<test213428@somemailservice.com>",
      )
    end

    it "does not use the first post's incoming email if it was created via group_smtp, only handle_mail" do
      incoming =
        Fabricate(
          :incoming_email,
          message_id: "test213428@somemailservice.com",
          post: post,
          created_via: IncomingEmail.created_via_types[:group_smtp],
        )
      post.reload
      expect(subject.generate_for_topic(topic, use_incoming_email_if_present: true)).to match(
        subject.message_id_topic_id_regexp,
      )
      incoming.update(created_via: IncomingEmail.created_via_types[:handle_mail])
      expect(subject.generate_for_topic(topic, use_incoming_email_if_present: true)).to eq(
        "<test213428@somemailservice.com>",
      )
    end

    it "generates for the topic without an incoming_email record" do
      expect(subject.generate_for_topic(topic)).to match(subject.message_id_topic_id_regexp)
      expect(subject.generate_for_topic(topic, use_incoming_email_if_present: true)).to match(
        subject.message_id_topic_id_regexp,
      )
    end

    it "generates canonical for the topic" do
      canonical_topic_id = subject.generate_for_topic(topic, canonical: true)
      expect(canonical_topic_id).to match(subject.message_id_topic_id_regexp)
      expect(canonical_topic_id).to eq("<topic/#{topic.id}@test.localhost>")
    end
  end

  describe "#generate_or_use_existing" do
    it "does not override a post's existing outbound_message_id" do
      post.update!(outbound_message_id: "blah@host.test")
      result = subject.generate_or_use_existing(post.id)
      expect(result).to eq(["<blah@host.test>"])
    end

    it "generates an outbound_message_id in the correct format if it's blank for the post" do
      post.update!(outbound_message_id: nil)
      result = subject.generate_or_use_existing(post.id)
      expect(result).to eq(["<discourse/post/#{post.id}@#{Email::MessageIdService.host}>"])
    end

    it "handles bulk posts with a mixture of existing and new outbound_message_ids, returning in created_at order" do
      topic = Fabricate(:topic)
      post_bulk1 =
        Fabricate(
          :post,
          topic: topic,
          created_at: 10.days.ago,
          outbound_message_id: "blah@test.host",
        )
      post_bulk2 = Fabricate(:post, topic: topic, created_at: 12.days.ago, outbound_message_id: nil)
      post_bulk3 =
        Fabricate(
          :post,
          topic: topic,
          created_at: 11.days.ago,
          outbound_message_id: "sf92c349438509=3453@test.host",
        )
      post_bulk4 = Fabricate(:post, topic: topic, created_at: 3.days.ago, outbound_message_id: nil)
      result =
        subject.generate_or_use_existing(
          [post_bulk1.id, post_bulk2.id, post_bulk3.id, post_bulk4.id],
        )
      expect(result).to eq(
        [
          "<discourse/post/#{post_bulk2.id}@#{Email::MessageIdService.host}>",
          "<sf92c349438509=3453@test.host>",
          "<blah@test.host>",
          "<discourse/post/#{post_bulk4.id}@#{Email::MessageIdService.host}>",
        ],
      )
    end
  end

  describe "find_post_from_message_ids" do
    let(:post_format_message_id) { "<topic/#{topic.id}/#{post.id}.test123@test.localhost>" }
    let(:topic_format_message_id) { "<topic/#{topic.id}.test123@test.localhost>" }
    let(:discourse_format_message_id) { "<discourse/post/#{post.id}@test.localhost>" }
    let(:default_format_message_id) { "<36ac1ddd-5083-461d-b72c-6372fb0e7f33@test.localhost>" }
    let(:gmail_format_message_id) do
      "<CAPGrNgZ7QEFuPcsxJBRZLhBhAYPO_ruYpCANSdqiQEbc9Otpiw@mail.gmail.com>"
    end

    it "finds a post based only on a post-format message id" do
      expect(subject.find_post_from_message_ids([post_format_message_id])).to eq(post)
    end

    it "finds a post based only on a topic-format message id" do
      expect(subject.find_post_from_message_ids([topic_format_message_id])).to eq(post)
    end

    it "finds a post based only on a discourse-format message id" do
      expect(subject.find_post_from_message_ids([discourse_format_message_id])).to eq(post)
    end

    it "finds a post from the post's outbound_message_id" do
      post.update!(outbound_message_id: subject.message_id_clean(discourse_format_message_id))
      expect(subject.find_post_from_message_ids([discourse_format_message_id])).to eq(post)
    end

    it "finds a post from the email log" do
      email_log =
        Fabricate(:email_log, message_id: subject.message_id_clean(default_format_message_id))
      expect(subject.find_post_from_message_ids([default_format_message_id])).to eq(email_log.post)
    end

    it "finds a post from the incoming email log" do
      incoming_email =
        Fabricate(
          :incoming_email,
          message_id: subject.message_id_clean(gmail_format_message_id),
          post: Fabricate(:post),
        )
      expect(subject.find_post_from_message_ids([gmail_format_message_id])).to eq(
        incoming_email.post,
      )
    end

    it "gets the last created post if multiple are returned" do
      incoming_email =
        Fabricate(
          :incoming_email,
          message_id: subject.message_id_clean(post_format_message_id),
          post: Fabricate(:post, created_at: 10.days.ago),
        )
      expect(subject.find_post_from_message_ids([post_format_message_id])).to eq(post)
    end
  end

  describe "#discourse_generated_message_id?" do
    def check_format(message_id)
      subject.discourse_generated_message_id?(message_id)
    end

    it "works correctly for the different possible formats" do
      expect(check_format("topic/1223/4525.3c4f8n9@test.localhost")).to eq(true)
      expect(check_format("<topic/1223/4525.3c4f8n9@test.localhost>")).to eq(true)
      expect(check_format("topic/1223.fc3j4843@test.localhost")).to eq(true)
      expect(check_format("<topic/1223.fc3j4843@test.localhost>")).to eq(true)
      expect(check_format("topic/1223/4525@test.localhost")).to eq(true)
      expect(check_format("<topic/1223/4525@test.localhost>")).to eq(true)
      expect(check_format("topic/1223@test.localhost")).to eq(true)
      expect(check_format("<topic/1223@test.localhost>")).to eq(true)
      expect(check_format("discourse/post/1223@test.localhost")).to eq(true)
      expect(check_format("<discourse/post/1223@test.localhost>")).to eq(true)

      expect(check_format("topic/1223@blah")).to eq(false)
      expect(
        check_format("<CAPGrNgZ7QEFuPcsxJBRZLhBhAYPO_ruYpCANSdqiQEbc9Otpiw@mail.gmail.com>"),
      ).to eq(false)
      expect(check_format("t/1223@test.localhost")).to eq(false)
    end
  end

  describe "#message_id_rfc_format" do
    it "returns message ID in RFC format" do
      expect(Email::MessageIdService.message_id_rfc_format("test@test")).to eq("<test@test>")
    end

    it "returns input if already in RFC format" do
      expect(Email::MessageIdService.message_id_rfc_format("<test@test>")).to eq("<test@test>")
    end
  end

  describe "#message_id_clean" do
    it "returns message ID if in RFC format" do
      expect(Email::MessageIdService.message_id_clean("<test@test>")).to eq("test@test")
    end

    it "returns input if a clean message ID is not in RFC format" do
      message_id = "<" + "@" * 50
      expect(Email::MessageIdService.message_id_clean(message_id)).to eq(message_id)
    end
  end

  describe "#host" do
    it "handles hostname changes at runtime" do
      expect(Email::MessageIdService.host).to eq("test.localhost")
      SiteSetting.force_hostname = "other.domain.example.com"
      expect(Email::MessageIdService.host).to eq("other.domain.example.com")
    end
  end
end
