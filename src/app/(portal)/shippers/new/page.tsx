import {requireProfile} from "@/lib/auth";
import {createClient} from "@/lib/supabase/server";
import {resolveOrganizationCurrency} from "@/lib/organization-finance";
import {ShipperWorkspace} from "@/components/shipper-workspace";
import {ShipperCreateForm} from "@/components/shipper-create-form";
export const metadata={title:"Create shipper"};
export default async function NewShipperPage() {
 const actor=await requireProfile(["super_admin","operations_admin"]),currency=await resolveOrganizationCurrency(await createClient(),actor.organization_id!);
 return <ShipperWorkspace title="Create shipper" description="Add a customer login, business profile and initial rate card." canCreate><ShipperCreateForm currency={currency}/></ShipperWorkspace>;
}
