import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

import { APP_NAME, SUPPORT_EMAIL } from "../../lib/brand";
import styles from "./styles.module.css";

// Public landing page. Installs start from the Shopify App Store, never from a shop-domain form here.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return null;
};

export default function App() {
  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>{APP_NAME}</h1>
        <p className={styles.text}>
          A size finder for your product pages: shoppers get one clear size from their height and weight.
        </p>
        <ul className={styles.list}>
          <li>
            <strong>Size finder</strong>. Two drags and a few taps give each shopper one recommended size, with
            how it fits at the chest, waist and hips.
          </li>
          <li>
            <strong>Size chart tab</strong>. The classic table in cm or inches, with how-to-measure notes, for
            shoppers who want the numbers.
          </li>
          <li>
            <strong>Assignment rules</strong>. Assign charts by product, collection, type, vendor or tag, and new
            products pick up the right chart on their own.
          </li>
        </ul>
        <p className={styles.links}>
          <a href="/privacy">Privacy policy</a> · <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
        </p>
      </div>
    </div>
  );
}
