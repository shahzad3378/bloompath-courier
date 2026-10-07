type AwbBrandSettings = { awb_brand_name?: string | null; display_name?: string | null };

/** Use the tenant's label identity; never borrow another courier's brand. */
export function resolveAwbBrandName(settings: AwbBrandSettings | null | undefined): string {
  return settings?.awb_brand_name?.trim() || settings?.display_name?.trim() || "Our";
}
