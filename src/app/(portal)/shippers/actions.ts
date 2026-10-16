"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { resolveOrganizationCurrency } from "@/lib/organization-finance";
import { createClient } from "@/lib/supabase/server";

const rateRoles = ["super_admin", "operations_admin", "finance_staff"] as const;

function money(formData: FormData, key: string) {
  const raw = String(formData.get(key) ?? "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 && value <= 999999.99
    ? value
    : null;
}

function percentage(formData: FormData, key: string) {
  const raw = String(formData.get(key) ?? "").trim();
  if (!/^\d+(\.\d{1,3})?$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
}

function vatSettings(formData: FormData) {
  const vatApplicable = String(formData.get("vat_applicable") ?? "") === "true";
  const vatRate = vatApplicable ? percentage(formData, "vat_rate") : 0;
  const vatInclusive = vatApplicable
    && String(formData.get("vat_inclusive") ?? "") === "true";
  const taxRegistrationNumber = vatApplicable
    ? String(formData.get("tax_registration_number") ?? "").trim().slice(0, 100)
    : "";

  return {
    valid: vatRate !== null,
    vatApplicable,
    vatRate,
    vatInclusive,
    taxRegistrationNumber: taxRegistrationNumber || null,
  };
}

export async function saveShipperRateAction(formData: FormData): Promise<void> {
  const profile = await requireProfile(rateRoles);

  const shipperId = String(formData.get("shipper_id") ?? "");
  const deliveryRate = money(formData, "delivery_rate");
  const returnChargeEnabled =
    String(formData.get("return_charge_enabled") ?? "") === "true";
  const returnRate = returnChargeEnabled
    ? money(formData, "return_rate")
    : 0;
  const vat = vatSettings(formData);

  if (
    !profile.organization_id ||
    !/^[0-9a-f-]{36}$/i.test(shipperId) ||
    deliveryRate === null ||
    returnRate === null ||
    !vat.valid
  ) {
    redirect("/shippers?error=invalid");
  }

  const supabase = await createClient();
  const currency = await resolveOrganizationCurrency(
    supabase,
    profile.organization_id,
  );

  const { data: shipper } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", shipperId)
    .eq("organization_id", profile.organization_id)
    .eq("role", "shipper")
    .maybeSingle();

  if (!shipper) {
    redirect("/shippers?error=shipper");
  }

  const now = new Date().toISOString();

  const { error: closeError } = await supabase
    .from("shipper_rates")
    .update({ effective_to: now })
    .eq("organization_id", profile.organization_id)
    .eq("shipper_id", shipperId)
    .is("effective_to", null);

  if (closeError) {
    redirect(`/shippers?error=rate&shipper=${shipperId}`);
  }

  const { error } = await supabase.from("shipper_rates").insert({
    organization_id: profile.organization_id,
    shipper_id: shipperId,
    delivery_rate: deliveryRate,
    return_charge_enabled: returnChargeEnabled,
    return_rate: returnChargeEnabled ? returnRate : 0,
    vat_applicable: vat.vatApplicable,
    vat_rate: vat.vatRate,
    vat_inclusive: vat.vatInclusive,
    tax_registration_number: vat.taxRegistrationNumber,
    currency,
    effective_from: now,
    created_by: profile.id,
  });

  if (error) {
    redirect(`/shippers?error=rate&shipper=${shipperId}`);
  }

  revalidatePath("/shippers");
  revalidatePath("/finance");
  revalidatePath(`/shippers/${shipperId}`);
  redirect(`/shippers/${shipperId}?saved=rate`);
}

import { createAdminClient } from "@/lib/supabase/admin";

function cleanText(formData: FormData, key: string, max = 200) {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}

export type ShipperFormState = {status: "idle" | "success" | "error"; message: string};
const formError = (message: string): ShipperFormState => ({status:"error",message});
export async function createShipperAction(_state: ShipperFormState, formData: FormData): Promise<ShipperFormState> {
  const profile = await requireProfile(["super_admin", "operations_admin"]);

  if (!profile.organization_id) {
    return formError("Your courier company is unavailable. Refresh and sign in again.");
  }

  const companyName = cleanText(formData, "company_name", 150);
  const contactPerson = cleanText(formData, "contact_person", 150);
  const email = cleanText(formData, "email", 200).toLowerCase();
  const phone = cleanText(formData, "phone", 50);
  const address = cleanText(formData, "address", 500);
  const city = cleanText(formData, "city", 100);
  const password = String(formData.get("password") ?? "");

  const deliveryRate = money(formData, "delivery_rate");
  const returnChargeEnabled =
    String(formData.get("return_charge_enabled") ?? "") === "true";
  const returnRate = returnChargeEnabled
    ? money(formData, "return_rate")
    : 0;
  const vat = vatSettings(formData);

  const codCycleDays = Number(
    String(formData.get("cod_cycle_days") ?? "7"),
  );

  if (
    companyName.length < 2 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    (password.length < 8 || password.length > 72) ||
    deliveryRate === null ||
    returnRate === null ||
    !vat.valid ||
    !Number.isInteger(codCycleDays) ||
    codCycleDays < 1 ||
    codCycleDays > 90
  ) {
    return formError("Check company name, valid email, password (8–72 characters), rates and COD cycle (1–90 days).");
  }

  const admin = createAdminClient();
  const supabase = await createClient();
  const currency = await resolveOrganizationCurrency(
    supabase,
    profile.organization_id,
  );

  const { data: authData, error: authError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: companyName,
        role: "shipper",
      },
    });

  if (authError || !authData.user) {
    console.error("CREATE_SHIPPER_AUTH_ERROR", authError);
    return formError("The account could not be created. Check whether this login email already exists and review the password.");
  }

  const userId = authData.user.id;

  try {
    const { data: updatedProfile, error: profileError } = await admin
      .from("profiles")
      .update({
        organization_id: profile.organization_id,
        full_name: companyName,
        email,
        phone: phone || null,
        role: "shipper",
        status: "active",
      })
      .eq("id", userId)
      .select("id")
      .maybeSingle();

    if (profileError || !updatedProfile) {
      console.error("CREATE_SHIPPER_PROFILE_ERROR", profileError);
      throw profileError ?? new Error("Auto-created shipper profile was not found.");
    }

    const { error: businessError } = await admin
      .from("shipper_business_profiles")
      .insert({
        shipper_id: userId,
        organization_id: profile.organization_id,
        company_name: companyName,
        contact_person: contactPerson || null,
        address: address || null,
        city: city || null,
        cod_cycle_days: codCycleDays,
      });

    if (businessError) {
      console.error("CREATE_SHIPPER_BUSINESS_ERROR", businessError);
      throw businessError;
    }

    const { error: rateError } = await admin.from("shipper_rates").insert({
      organization_id: profile.organization_id,
      shipper_id: userId,
      delivery_rate: deliveryRate,
      return_charge_enabled: returnChargeEnabled,
      return_rate: returnChargeEnabled ? returnRate : 0,
      vat_applicable: vat.vatApplicable,
      vat_rate: vat.vatRate,
      vat_inclusive: vat.vatInclusive,
      tax_registration_number: vat.taxRegistrationNumber,
      currency,
      effective_from: new Date().toISOString(),
      created_by: profile.id,
    });

    if (rateError) {
      console.error("CREATE_SHIPPER_RATE_ERROR", rateError);
      throw rateError;
    }
  } catch (error) {
    console.error("CREATE_SHIPPER_FAILED", error);
    await admin.auth.admin.deleteUser(userId);
    return formError("The shipper profile could not be saved. No complete shipper account was created. Try again.");
  }

  revalidatePath("/shippers");
  revalidatePath("/users");
  if (String(formData.get("upload_rates_after") ?? "") === "true") {
    redirect(`/shippers/${userId}/carrier-rates`);
  }
  redirect(`/shippers?created=1&shipper=${userId}`);
}

export async function setShipperStatusAction(formData: FormData): Promise<void> {
  const profile = await requireProfile(["super_admin", "operations_admin"]);

  const shipperId = String(formData.get("shipper_id") ?? "");
  const status = String(formData.get("status") ?? "");

  if (
    !profile.organization_id ||
    !/^[0-9a-f-]{36}$/i.test(shipperId) ||
    (formData.get("confirm_status") !== "on" || !["active", "suspended", "inactive"].includes(status))
  ) {
    redirect("/shippers?error=status");
  }

  const supabase = await createClient();

  const {data:target}=await supabase.from("profiles").select("id,status").eq("id",shipperId).eq("organization_id",profile.organization_id).eq("role","shipper").maybeSingle();
  if(!target || (target.status === "inactive" && status !== "inactive" && profile.role !== "super_admin")) redirect("/shippers?error=status");

  const { data, error } = await supabase
    .from("profiles")
    .update({ status })
    .eq("id", shipperId)
    .eq("organization_id", profile.organization_id)
    .eq("role", "shipper")
    .select("id")
    .maybeSingle();

  if (error || !data) {
    redirect("/shippers?error=status");
  }

  revalidatePath("/shippers");
  revalidatePath("/shipments");

  revalidatePath(`/shippers/${shipperId}`);
  redirect(`/shippers/${shipperId}?saved=status`);
}


export async function updateShipperDetailsAction(_state: ShipperFormState, form: FormData): Promise<ShipperFormState> {
  const actor = await requireProfile(["super_admin", "operations_admin"]);
  const id = cleanText(form,"shipper_id",36);
  if (!actor.organization_id || !/^[0-9a-f-]{36}$/i.test(id)) return formError("Select a shipper in your courier company.");
  const company = cleanText(form,"company_name",150), email = cleanText(form,"email",200).toLowerCase();
  const days = Number(form.get("cod_cycle_days"));
  if (company.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !Number.isInteger(days) || days<1 || days>90) return formError("Enter a company name, valid login email and COD cycle from 1 to 90 days.");
  const admin = createAdminClient();
  const {data:target,error:targetError} = await admin.from("profiles").select("id,email,full_name,phone,updated_at").eq("id",id).eq("organization_id",actor.organization_id).eq("role","shipper").maybeSingle();
  if (targetError || !target) return formError("This shipper is unavailable in your courier company.");
  const {data:business,error:businessError} = await admin.from("shipper_business_profiles").select("company_name,contact_person,address,city,cod_cycle_days,updated_at").eq("shipper_id",id).eq("organization_id",actor.organization_id).maybeSingle();
  if (businessError || !business) return formError("The business profile is unavailable. Contact the administrator before editing.");
  if (target.updated_at !== String(form.get("profile_version")) || business.updated_at !== String(form.get("business_version"))) return formError("This shipper was changed elsewhere. Reload its details before saving.");
  const nextBusiness = {company_name:company,contact_person:cleanText(form,"contact_person",150)||null,address:cleanText(form,"address",500)||null,city:cleanText(form,"city",100)||null,cod_cycle_days:days};
  const {data:savedBusiness,error:saveBusinessError} = await admin.from("shipper_business_profiles").update(nextBusiness).eq("shipper_id",id).eq("organization_id",actor.organization_id).eq("updated_at",business.updated_at).select("updated_at").maybeSingle();
  if (saveBusinessError || !savedBusiness) return formError("The profile changed or could not be saved. Reload before trying again.");
  async function rollbackBusiness() {
    const {updated_at:previousVersion,...previous}=business!; void previousVersion;
    const {data,error}=await admin.from("shipper_business_profiles").update(previous).eq("shipper_id",id).eq("organization_id",actor.organization_id!).eq("updated_at",savedBusiness!.updated_at).select("shipper_id").maybeSingle();
    return !error && Boolean(data);
  }
  const emailChanged = email !== target.email.toLowerCase();
  if (emailChanged) {
    const {error}=await admin.auth.admin.updateUserById(id,{email,email_confirm:true});
    if (error) {const restored=await rollbackBusiness();return formError(restored?"Login email could not be updated. Check whether another account uses it. Your saved details were restored.":"Email update failed and profile recovery needs administrator review. Reload before continuing.");}
  }
  const {data:saved,error}=await admin.from("profiles").update({full_name:company,email,phone:cleanText(form,"phone",50)||null}).eq("id",id).eq("organization_id",actor.organization_id).eq("role","shipper").eq("updated_at",target.updated_at).select("id").maybeSingle();
  if(error || !saved) {
    const restored=await rollbackBusiness();
    const authRollback=emailChanged?await admin.auth.admin.updateUserById(id,{email:target.email,email_confirm:true}):{error:null};
    return formError(restored&&!authRollback.error?"The profile changed or saving failed. Previous details were restored. Reload before trying again.":"Saving failed and account recovery needs administrator review. Reload before continuing.");
  }
  revalidatePath("/shippers");revalidatePath(`/shippers/${id}`);revalidatePath("/shipper");
  redirect(`/shippers/${id}?saved=profile`);
}

export async function resetShipperPasswordAction(_state: ShipperFormState, form: FormData): Promise<ShipperFormState> {
  const actor = await requireProfile(["super_admin","operations_admin"]);
  const id=cleanText(form,"shipper_id",36),password=String(form.get("password")??"");
  if(!actor.organization_id || !/^[0-9a-f-]{36}$/i.test(id)) return formError("Select a shipper in your courier company.");
  if(password.length<8 || password.length>72 || password!==String(form.get("confirm_password"))) return formError("Use 8–72 characters and enter the same password in both fields.");
  if(form.get("confirm_reset")!=="on") return formError("Confirm the password reset before continuing.");
  const admin=createAdminClient();
  const {data:target,error}=await admin.from("profiles").select("id").eq("id",id).eq("organization_id",actor.organization_id).eq("role","shipper").maybeSingle();
  if(error || !target) return formError("This shipper is unavailable in your courier company.");
  const {error:authError}=await admin.auth.admin.updateUserById(id,{password});
  if(authError) return formError("Password could not be reset. Try a stronger password or contact the administrator.");
  return {status:"success",message:"Shipper password reset successfully. Share the new password securely. Existing active sessions are not signed out by this action."};
}
