import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { decode } from 'base64-arraybuffer';
import * as Crypto from 'expo-crypto';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const configured = Boolean(url && key);

export const supabase = configured
  ? createClient(url!, key!, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

export type Profile = {
  id: string;
  organization_id: string;
  full_name: string;
  role: string;
  status: string;
};

export type Shipment = {
  id: number;
  tracking_number: string;
  consignee_name: string;
  consignee_phone: string;
  consignee_alt_phone: string | null;
  consignee_address: string;
  consignee_area: string | null;
  consignee_city: string;
  consignee_country_code: string | null;
  consignee_landmark: string | null;
  delivery_instructions: string | null;
  cod_amount: number;
  currency: string | null;
  payment_type: string;
  delivery_attempt_count: number;
  delivery_latitude: number | null;
  delivery_longitude: number | null;
  status: string;
};

export type Stop = {
  id: number;
  run_id: number;
  shipment_id: number;
  stop_sequence: number | null;
  completed_at: string | null;
  shipments: Shipment;
};

export type Route = {
  id: number;
  run_number: string;
  route_name: string;
  handed_over_at: string | null;
  status: string;
};

export const reasons = [
  ['customer_unavailable', 'Customer unavailable'],
  ['customer_refused', 'Customer refused'],
  ['wrong_address', 'Wrong address'],
  ['phone_unreachable', 'Phone unreachable'],
  ['reschedule_requested', 'Reschedule requested'],
  ['cash_not_ready', 'Cash not ready'],
  ['restricted_access', 'Restricted access'],
  ['other', 'Other'],
] as const;

export async function loadDriverProfile(): Promise<Profile> {
  if (!supabase) throw new Error('Supabase configuration is missing.');
  const { data: userResult, error: userError } = await supabase.auth.getUser();
  if (userError || !userResult.user) throw new Error('Your session has expired. Sign in again.');
  const { data, error } = await supabase
    .from('profiles')
    .select('id, organization_id, full_name, role, status')
    .eq('id', userResult.user.id)
    .maybeSingle();
  if (error) throw new Error('Could not check your driver account. Retry.');
  if (!data || data.status !== 'active' || data.role !== 'driver' || !data.organization_id) {
    throw new Error('This account does not have an active driver profile. Contact dispatch.');
  }
  return data as Profile;
}

export async function loadAssignedStops(profile: Profile): Promise<{ routes: Route[]; stops: Stop[]; currency: string }> {
  if (!supabase) throw new Error('Supabase configuration is missing.');
  const { data: routes, error: routeError } = await supabase
    .from('dispatch_runs')
    .select('id, run_number, route_name, handed_over_at, status')
    .eq('driver_id', profile.id)
    .eq('organization_id', profile.organization_id)
    .eq('status', 'handed_over')
    .order('handed_over_at', { ascending: true });
  if (routeError) throw new Error('Could not load assigned routes. Retry.');
  const activeRoutes = (routes ?? []) as Route[];
  const { data: settings } = await supabase.from('organization_settings').select('currency').eq('organization_id', profile.organization_id).maybeSingle();
  const currency = String(settings?.currency ?? '');
  if (!activeRoutes.length) return { routes: [], stops: [], currency };

  const stops: Stop[] = [];
  for (let offset = 0; ; offset += 200) {
    const { data, error } = await supabase
      .from('dispatch_run_items')
      .select('id, run_id, shipment_id, stop_sequence, completed_at, shipments(id, tracking_number, consignee_name, consignee_phone, consignee_alt_phone, consignee_address, consignee_area, consignee_city, consignee_country_code, consignee_landmark, delivery_instructions, cod_amount, currency, payment_type, delivery_attempt_count, delivery_latitude, delivery_longitude, status)')
      .in('run_id', activeRoutes.map((route) => route.id))
      .is('completed_at', null)
      .order('run_id', { ascending: true })
      .order('stop_sequence', { ascending: true, nullsFirst: false })
      .order('id', { ascending: true })
      .range(offset, offset + 199);
    if (error) throw new Error('Could not load route stops. Retry.');
    const page = (data ?? []) as unknown as Stop[];
    stops.push(...page);
    if (page.length < 200) break;
  }
  return { routes: activeRoutes, stops, currency };
}

export async function saveDeliveryResult(input: {
  profile: Profile;
  stop: Stop;
  outcome: 'delivered' | 'undelivered';
  reason: string | null;
  notes: string;
  photoBase64: string;
}): Promise<void> {
  if (!supabase) throw new Error('Supabase configuration is missing.');
  if (!input.photoBase64) throw new Error('Take a proof photo first.');
  if (input.outcome === 'undelivered' && !reasons.some(([value]) => value === input.reason)) {
    throw new Error('Select an undelivered reason.');
  }
  if (input.notes.length > 500) throw new Error('Notes must be 500 characters or less.');
  const photo = decode(input.photoBase64);
  if (photo.byteLength === 0 || photo.byteLength > 5 * 1024 * 1024) {
    throw new Error('Proof photo must be a JPG of 5 MB or less.');
  }

  // Recheck the assignment immediately before uploading. The database trigger
  // remains the final authority on driver, route, attempt and shipment state.
  const { data: item, error: itemError } = await supabase
    .from('dispatch_run_items')
    .select('id, shipment_id, completed_at, dispatch_runs!inner(driver_id, status)')
    .eq('id', input.stop.id)
    .maybeSingle();
  const run = item?.dispatch_runs as unknown as { driver_id: string; status: string } | undefined;
  if (itemError || !item || item.completed_at || run?.driver_id !== input.profile.id || run.status !== 'handed_over') {
    throw new Error('This stop is no longer assigned to you. Refresh your route.');
  }

  const proofPath = `${input.profile.organization_id}/${input.profile.id}/${Crypto.randomUUID()}.jpg`;
  const { error: uploadError } = await supabase.storage.from('delivery-proofs').upload(proofPath, photo, {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (uploadError) throw new Error('Proof photo could not be uploaded. Check connection and retry.');

  const { error: insertError } = await supabase.from('delivery_attempts').insert({
    organization_id: input.profile.organization_id,
    run_item_id: input.stop.id,
    shipment_id: input.stop.shipment_id,
    attempt_number: 1,
    outcome: input.outcome,
    undelivered_reason: input.outcome === 'undelivered' ? input.reason : null,
    notes: input.notes.trim() || null,
    proof_path: proofPath,
    performed_by: input.profile.id,
  });
  if (insertError) {
    await supabase.storage.from('delivery-proofs').remove([proofPath]);
    if (insertError.message.includes('already been completed')) {
      throw new Error('This stop was already completed. Refresh your route.');
    }
    if (insertError.message.includes('fourth attempt')) throw new Error(insertError.message);
    throw new Error('Delivery result was not saved. Check the details and retry.');
  }
}

