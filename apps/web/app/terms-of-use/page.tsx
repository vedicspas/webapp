import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { getSiteSettingsSafe } from "@/lib/api";

export const metadata: Metadata = {
  title: "Terms of Use",
};

export const dynamic = "force-dynamic";

const linkClass = "text-veda-700 underline hover:text-veda-900";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-veda-900">{title}</h2>
      {children}
    </section>
  );
}

function BulletList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-2 pl-5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export default async function TermsOfUsePage() {
  const settings = await getSiteSettingsSafe();
  const email = settings.contactEmail;

  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold text-veda-900">Terms of Use</h1>

      <div className="mt-8 space-y-8 text-base leading-relaxed text-foreground/80">
        <p>
          Welcome to AyurvedaAdvisor.com (&ldquo;AyurvedaAdvisor,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or
          &ldquo;our&rdquo;).
        </p>
        <p>
          These Terms of Use govern your access to and use of our website and its features, including
          clinic listings, information, ratings, reviews, photographs, and communications. They apply
          to visitors, patients, reviewers, clinics, practitioners, and anyone submitting or managing
          content.
        </p>
        <p>By using the website, you agree to these Terms. If you do not agree, please do not use the website.</p>

        <Section title="1. About AyurvedaAdvisor">
          <p>
            AyurvedaAdvisor is an information and review platform that helps people discover and
            compare Ayurveda clinics, practitioners, wellness centres, and related services.
          </p>
          <p>
            Unless expressly stated otherwise, we do not operate the listed clinics, provide medical
            treatment, or act as a healthcare provider. Clinics and practitioners are independent
            third parties responsible for their services, professional conduct, and compliance with
            applicable laws.
          </p>
          <p>
            A listing, rating, review, badge, or appearance in search results does not by itself
            constitute our endorsement or guarantee of a provider.
          </p>
        </Section>

        <Section title="2. No medical advice">
          <p>
            Information on AyurvedaAdvisor is provided for general informational purposes. This
            includes articles, clinic descriptions, reviews, treatment information, and any automated
            or AI-assisted content made available through the website.
          </p>
          <p>
            This information is not a substitute for professional medical advice, diagnosis, or
            treatment. Always consult an appropriately qualified healthcare professional about your
            health, treatment options, medicines, supplements, and possible interactions.
          </p>
          <p>
            Do not disregard medical advice or delay seeking care because of information found on this
            website. Individual experiences and treatment outcomes vary. We do not guarantee the
            safety, suitability, effectiveness, or results of any treatment or service.
          </p>
          <p>
            The website is not an emergency service. In an emergency, contact your local emergency
            services immediately.
          </p>
        </Section>

        <Section title="3. Eligibility and accounts">
          <p>
            You must be at least 18 years old and legally able to accept these Terms to create an
            account, submit a review, or manage a clinic listing.
          </p>
          <p>
            You agree to provide accurate information, keep your account details current, and protect
            your login credentials. You must not impersonate another person or create accounts to
            mislead users or manipulate ratings.
          </p>
          <p>Notify us promptly if you believe your account has been accessed without permission.</p>
          <p>Anyone managing a clinic listing must have authority to represent that clinic.</p>
        </Section>

        <Section title="4. Clinic listings and responsibilities">
          <p>
            Clinic owners and authorised representatives are responsible for ensuring that information
            they submit is accurate, current, lawful, and not misleading.
          </p>
          <p>
            This includes information about qualifications, registrations, licences, accreditations,
            treatments, facilities, photographs, prices, packages, and contact details.
          </p>
          <p>Clinics must:</p>
          <BulletList
            items={[
              "Maintain the licences, permissions, and qualifications required for their services.",
              "Avoid unsupported claims about cures, guaranteed outcomes, or treatment effectiveness.",
              "Have permission to publish submitted photographs, logos, and other materials.",
              "Respect patient confidentiality when responding to reviews or enquiries.",
              "Update information when services, prices, personnel, or other material details change.",
            ]}
          />
          <p>
            We may request supporting information before allowing someone to claim or manage a listing.
            Any verification badge relates only to the checks described for that badge; it is not a
            guarantee of clinical quality, regulatory compliance, or treatment outcomes.
          </p>
        </Section>

        <Section title="5. Reviews, ratings, and photographs">
          <p>
            Reviews should reflect a genuine, first-hand experience with the relevant clinic or
            service. Patients, visitors, and accompanying persons may describe their own experiences,
            but must not claim to have received treatment if they did not.
          </p>
          <p>When submitting content, you agree that:</p>
          <BulletList
            items={[
              "Your review is honest and based on your own experience.",
              "Factual statements are accurate to the best of your knowledge.",
              "Opinions are presented as opinions.",
              "You have the necessary rights and permissions for uploaded content.",
              "You will not publish another person\u2019s private or sensitive information without appropriate permission.",
            ]}
          />
          <p>
            Do not submit fabricated experiences, copied reviews, spam, undisclosed promotional
            content, or reviews intended to manipulate ratings. AI-generated content must not be used
            to invent a visit, treatment, or experience.
          </p>
          <p>
            Clinic owners, employees, agents, and competitors must not pose as independent patients or
            visitors. Any relevant personal or business relationship must be clearly disclosed.
            Reviews offered in exchange for payment, discounts, gifts, or other benefits are not
            permitted on this platform.
          </p>
          <p>
            Clinics must not pressure, threaten, or reward people to submit favourable reviews or
            remove honest criticism.
          </p>
          <p>
            Reviews represent their authors&apos; experiences and opinions. Publication does not mean
            that AyurvedaAdvisor agrees with or has independently verified every statement.
          </p>
        </Section>

        <Section title="6. Content moderation and complaints">
          <p>
            We may review, restrict, or remove content that violates these Terms or applicable law,
            including fraudulent content, harassment, threats, unlawful material, privacy violations,
            and infringement of intellectual property rights.
          </p>
          <p>
            Reviews may appear before moderation. Publication does not guarantee that content will
            remain available.
          </p>
          <p>
            We will not remove a review solely because it is negative or because a clinic disagrees
            with it. The same content standards apply to positive and negative reviews.
          </p>
          <p>
            To report content,{" "}
            <Link href="/contact" target="_blank" rel="noopener noreferrer" className={linkClass}>
              contact us
            </Link>{" "}
            with the relevant page link, an explanation, and any supporting information. We may
            request clarification from the parties involved and take appropriate action.
          </p>
          <p>
            We do not act as a court, medical regulator, or arbitrator of treatment disputes. Where
            appropriate, complaints should also be directed to the clinic, relevant regulator,
            consumer authority, or other competent body.
          </p>
        </Section>

        <Section title="7. Ownership of submitted content">
          <p>You retain ownership of the content you submit.</p>
          <p>
            By submitting content, you grant AyurvedaAdvisor a non-exclusive, worldwide, royalty-free
            licence to host, store, reproduce, display, distribute, and technically adapt that content
            as reasonably necessary to operate and present the website. Technical adaptations may
            include resizing photographs or formatting text without materially changing its meaning.
          </p>
          <p>
            This licence does not transfer ownership to us or permit unrelated use of your content.
            Removal requests and any necessary retention are subject to applicable law and our{" "}
            <Link href="/privacy-policy" className={linkClass}>
              Privacy Policy
            </Link>
            .
          </p>
        </Section>

        <Section title="8. Acceptable use">
          <p>You must not:</p>
          <BulletList
            items={[
              "Use the website for unlawful, fraudulent, or misleading purposes.",
              "Harass, threaten, impersonate, or discriminate against others.",
              "Upload malware or attempt unauthorised access.",
              "Manipulate reviews, ratings, listings, or search results.",
              "Harvest personal information or send unsolicited communications.",
              "Infringe intellectual property, confidentiality, or privacy rights.",
              "Interfere with website security or availability.",
              "Scrape or reproduce substantial parts of the website without permission, except where applicable law permits it.",
            ]}
          />
        </Section>

        <Section title="9. Dealings with clinics and third parties">
          <p>
            Any treatment, consultation, booking, payment, refund, cancellation, or other arrangement
            with a clinic is governed by your agreement with that provider, unless we expressly state
            otherwise for a particular service.
          </p>
          <p>
            Before choosing a provider, independently confirm its qualifications, suitability,
            pricing, treatment risks, and relevant policies.
          </p>
          <p>
            We are not responsible for a third party&apos;s acts or omissions merely because it is
            listed on the website. Nothing in these Terms excludes responsibility that applicable law
            places on AyurvedaAdvisor for its own services or conduct.
          </p>
          <p>
            Links to external websites are provided for convenience. Those websites have their own
            terms and privacy practices.
          </p>
        </Section>

        <Section title="10. Rankings and sponsored content">
          <p>
            Ratings and rankings may reflect user feedback, available information, relevance, and
            other factors. They are not clinical assessments or guarantees of quality.
          </p>
          <p>
            Where we offer paid advertisements, sponsored listings, or featured placements, we will
            identify them appropriately. Paid placement does not constitute a medical recommendation.
          </p>
        </Section>

        <Section title="11. Privacy">
          <p>
            Our collection and use of personal information are described in our{" "}
            <Link href="/privacy-policy" className={linkClass}>
              Privacy Policy
            </Link>
            .
          </p>
          <p>
            Reviews and other public submissions may be visible to anyone and may appear in search
            engines. Avoid publishing medical records, identification documents, contact details, or
            information you do not want made public.
          </p>
          <p>
            Clinics must not disclose confidential patient information in public responses, even when
            responding to criticism.
          </p>
        </Section>

        <Section title="12. Website intellectual property">
          <p>
            Except for user submissions and third-party materials, the website&apos;s branding,
            design, software, and original content belong to AyurvedaAdvisor or its licensors.
          </p>
          <p>
            You may use the website for personal browsing and authorised clinic management. You may
            not reproduce, sell, or commercially exploit our protected materials without permission,
            except as permitted by applicable law.
          </p>
        </Section>

        <Section title="13. Availability and disclaimers">
          <p>
            We aim to provide a useful platform, but information may be incomplete, outdated, or
            inaccurate. We do not guarantee uninterrupted access or that the website will be free from
            errors.
          </p>
          <p>
            To the extent permitted by law, the website is provided &ldquo;as is&rdquo; and
            &ldquo;as available,&rdquo; without warranties concerning its accuracy, availability, or
            suitability for a particular purpose.
          </p>
        </Section>

        <Section title="14. Limitation of liability">
          <p>
            To the extent permitted by applicable law, AyurvedaAdvisor and its operators are not
            liable for indirect or consequential losses arising from use of the website, reliance on
            third-party content, or dealings with listed providers.
          </p>
          <p>
            Nothing in these Terms excludes or limits liability that cannot lawfully be excluded or
            limited, including liability for fraud or any mandatory consumer rights.
          </p>
        </Section>

        <Section title="15. Suspension or termination">
          <p>
            We may restrict or suspend accounts, listings, or submissions where reasonably necessary
            to address violations of these Terms, security concerns, fraud, or legal obligations.
          </p>
          <p>
            Where appropriate and legally permitted, we will provide notice and an opportunity to
            request a review. You may stop using the website at any time and contact us about closing
            your account.
          </p>
        </Section>

        <Section title="16. Changes to these Terms">
          <p>
            We may update these Terms as the website or applicable requirements change. Updated Terms
            will appear on this page.
          </p>
          <p>
            Where required by law, we will provide additional notice or obtain consent for material
            changes. Changes will not retrospectively remove rights that have already arisen.
          </p>
        </Section>

        <Section title="17. Governing law">
          <p>These Terms are governed by the laws of USA.</p>
          <p>
            Subject to mandatory legal rights and applicable jurisdiction rules, disputes relating to
            these Terms will be handled by the competent courts in USA. This clause does not override
            consumer protections or other rights that cannot lawfully be waived.
          </p>
        </Section>

        <Section title="18. Contact us">
          <p>
            For questions about these Terms, account issues, or content complaints,{" "}
            {email ? (
              <>
                write to us at{" "}
                <a href={`mailto:${email}`} className={linkClass}>
                  {email}
                </a>{" "}
                or visit the{" "}
              </>
            ) : (
              "visit the "
            )}
            <Link href="/contact" className={linkClass}>
              contact us
            </Link>{" "}
            page.
          </p>
        </Section>
      </div>
    </article>
  );
}
