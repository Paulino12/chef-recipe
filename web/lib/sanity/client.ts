import { createClient } from "@sanity/client";
import { apiVersion, dataset, projectId } from "@/sanity/env";

/**
 * Public read client (published content).
 * No token needed for public datasets / published reads.
 */
export const sanity = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: true,
});
