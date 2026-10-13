import type { Metadata } from "next";
import { ContactForm } from "./ContactForm";

export const metadata: Metadata = {
  title: "Contact Us",
};

export default function ContactPage() {
  return <ContactForm />;
}
