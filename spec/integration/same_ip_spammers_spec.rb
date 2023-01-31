# encoding: UTF-8
# frozen_string_literal: true

RSpec.describe "spammers on same IP" do
  let(:ip_address) { "182.189.119.174" }
  let!(:spammer1) { Fabricate(:user, ip_address: ip_address) }
  let!(:spammer2) { Fabricate(:user, ip_address: ip_address) }
  let(:spammer3) { Fabricate(:user, ip_address: ip_address) }

  context "when flag_sockpuppets is disabled" do
    let!(:first_post) { create_post(user: spammer1) }
    let!(:second_post) { create_post(user: spammer2, topic: first_post.topic) }

    it "should not increase spam count" do
      expect(first_post.reload.spam_count).to eq(0)
      expect(second_post.reload.spam_count).to eq(0)
    end
  end

  context "when flag_sockpuppets is enabled" do
    before { SiteSetting.flag_sockpuppets = true }

    after { SiteSetting.flag_sockpuppets = false }

    context "when first spammer starts a topic" do
      let!(:first_post) { create_post(user: spammer1) }

      context "when second spammer replies" do
        let!(:second_post) { create_post(user: spammer2, topic: first_post.topic) }

        it "should increase spam count" do
          expect(first_post.reload.spam_count).to eq(1)
          expect(second_post.reload.spam_count).to eq(1)
        end

        context "with third spam post" do
          let!(:third_post) { create_post(user: spammer3, topic: first_post.topic) }

          it "should increase spam count" do
            expect(first_post.reload.spam_count).to eq(1)
            expect(second_post.reload.spam_count).to eq(1)
            expect(third_post.reload.spam_count).to eq(1)
          end
        end
      end
    end

    context "when first user is not new" do
      let!(:old_user) do
        Fabricate(:user, ip_address: ip_address, created_at: 2.days.ago, trust_level: TrustLevel[1])
      end

      context "when first user starts a topic" do
        let!(:first_post) { create_post(user: old_user) }

        context "with a reply by a new user at the same IP address" do
          let!(:second_post) { create_post(user: spammer2, topic: first_post.topic) }

          it "should increase the spam count correctly" do
            expect(first_post.reload.spam_count).to eq(0)
            expect(second_post.reload.spam_count).to eq(1)
          end
        end
      end
    end
  end
end
