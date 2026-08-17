import type { Metadata } from "next";

import { CustomFieldsClient } from "./custom-fields-client";

export const metadata: Metadata = { title: "Custom fields" };

export default function CustomFieldsPage() {
  return <CustomFieldsClient />;
}
