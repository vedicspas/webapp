import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
};

const GOOGLE_API_POLICY =
  "https://developers.google.com/terms/api-services-user-data-policy#additional_requirements_for_specific_api_scopes";

const collected = [
  "The number of pages visited",
  "The date of the visit",
  "The sections of the web site visited",
  "The top level domains used to access our website",
  "The name of the domain you use to access our website",
  "The Internet Protocol (IP) address used",
  "The address of the web page visited before using AyurvedaAdvisor.com",
  "Browser type and settings",
  "The date and time the Services were used",
  "Information about browser configuration and plugins",
  "Language preferences",
] as const;

export default function PrivacyPolicyPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold text-veda-900">Privacy Policy</h1>

      <div className="mt-8 space-y-6 text-base leading-relaxed text-foreground/80">
        <p>
          Thanks for visiting us and checking out our privacy policy! Have questions or concerns? Let
          us know and we&apos;ll talk it through. We LOVE user input.
        </p>

        <p>
          <strong className="text-foreground">Most importantly</strong>
          —do we sell your information? Heck no! We don&apos;t like signing up for a service and then
          getting spammed with emails from other companies either. So we don&apos;t do that—we neither
          sell your information nor “share” it with unrelated companies.
        </p>

        <p>
          <strong className="text-foreground">Caveat</strong>: If you link from our site to a different
          site and sign in there, that site&apos;s Privacy Policy and Terms will apply.
        </p>

        <p>
          <strong className="text-foreground">Just visiting?</strong> Whether you access our website
          just to check us out or as a member and regular user, certain information MAY automatically
          be collected/stored. As with most
          websites and technology services delivered over the Internet, this information might
          include any or all of:
        </p>

        <ul className="space-y-2 pl-1">
          {collected.map((item) => (
            <li key={item} className="flex gap-3">
              <span className="mt-0.5 text-veda-600" aria-hidden>
                ✓
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>

        <p>
          We use this information for statistical purposes in order to improve our site and provide
          better service to our consumers. This information is not available to anyone other than our
          team and internet service provider.
        </p>

        <p>
          <strong className="text-foreground">Personally identifiable information</strong>: AyurvedaAdvisor.com
          will collect personally identifiable information (e.g., your email address, name, address or
          other identifier) only if you knowingly provide such information to us. We will not
          knowingly provide such information to anyone else, unless authorized or requested by you or
          as required by applicable law, legal process or regulation.
        </p>

        <p>
          If AyurvedaAdvisor.com engages in a merger, acquisition, bankruptcy, dissolution, reorganization,
          sale of some or all of AyurvedaAdvisor.com&apos;s assets or stock, financing, public offering of
          securities, acquisition of all or a portion of our business or similar, some or all
          Information may be shared or transferred, subject to standard confidentiality arrangements.
        </p>

        <p>
          <strong className="text-foreground">Third-Party Application Login</strong>: You have the
          option to log into your AyurvedaAdvisor.com account using third-party applications such as Facebook,
          Google, and LinkedIn. When you choose this login method, you grant us permission to collect
          and process the information associated with your name and email address from the selected
          third-party application. We use this information for authentication and identity
          verification purposes. Additionally, you have the choice to import your contacts into your
          AyurvedaAdvisor.com account, allowing you to connect with your friends on the AyurvedaAdvisor.com platform.
          It&apos;s important to note that your use of any third-party application and the personal
          data you share with them are subject to their respective terms of use, privacy policies, and
          other applicable policies.
        </p>

        <p>
          <strong className="text-foreground">
            AyurvedaAdvisor.com&apos;s use and transfer of information received from Google APIs to any other
            app will adhere to{" "}
            <a
              href={GOOGLE_API_POLICY}
              target="_blank"
              rel="noopener noreferrer"
              className="text-veda-700 underline hover:text-veda-900"
            >
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </strong>
        </p>

        <p>
          <strong className="text-foreground">Do we use cookies?</strong> Yes, we use cookies, but
          only to preserve users&apos; log-in status in its encrypted form. AyurvedaAdvisor.com does not use
          cookies to store any sensitive information about users.
        </p>

        <p>
          <strong className="text-foreground">Links to other sites outside AyurvedaAdvisor.com</strong>: Our
          website has other links to other sites. When you link to these sites, you are no longer on
          our site and are subject to the privacy policy (and Terms) of the new website.
        </p>

        <p>
          <strong className="text-foreground">Rights concerning the Privacy Policy</strong>:
          AyurvedaAdvisor.com reserves the right to change this policy at any time. Any changes or updates
          will be posted here so that you will always know what information we collect, how we might
          use that information and whether it could be disclosed to anyone.
        </p>

        <p>
          <strong className="text-foreground">Your Consent</strong>: By using AyurvedaAdvisor.com, you agree to
          our Privacy Policy. In addition to this Privacy Policy, please see our Terms of Use, which
          describe all conditions pertaining to use of the website.
        </p>

        <p>
          <strong className="text-foreground">Contact us</strong>: If you have any questions or
          concerns about our privacy policy, please{" "}
          <Link href="/contact" className="text-veda-700 underline hover:text-veda-900">
            contact us
          </Link>
          .
        </p>
      </div>
    </article>
  );
}
