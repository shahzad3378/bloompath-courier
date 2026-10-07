/* eslint-disable react-hooks/set-state-in-effect -- Auth and route effects intentionally reset stale driver data while sessions change. */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { loadAssignedStops, loadDriverProfile, supabase, type Profile, type Route, type Stop } from './courier';

type DriverContextValue = {
  session: Session | null;
  starting: boolean;
  profile: Profile | null;
  accessError: string | null;
  retryProfile: () => Promise<void>;
  routes: Route[];
  stops: Stop[];
  currency: string;
  loading: boolean;
  routeError: string | null;
  notice: string | null;
  setNotice: (value: string | null) => void;
  refresh: () => Promise<void>;
};

const DriverContext = createContext<DriverContextValue | null>(null);

export function DriverProvider({ children }: { children: ReactNode }) {
  const profileRequest = useRef(0);
  const routeRequest = useRef(0);
  const [session, setSession] = useState<Session | null>(null);
  const [starting, setStarting] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [stops, setStops] = useState<Stop[]>([]);
  const [currency, setCurrency] = useState('');
  const [loading, setLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) { setStarting(false); return; }
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) { setSession(data.session); setStarting(false); }
    }).catch(() => { if (mounted) setStarting(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      if (mounted) setSession(next);
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, []);

  const retryProfile = useCallback(async () => {
    const request = ++profileRequest.current;
    const identity = session?.user.id;
    try {
      const value = await loadDriverProfile();
      if (request !== profileRequest.current || value.id !== identity) return;
      setProfile(value); setAccessError(null);
    } catch (error) {
      if (request !== profileRequest.current) return;
      setProfile(null); setAccessError((error as Error).message);
    }
  }, [session?.user.id]);
  useEffect(() => {
    profileRequest.current++; routeRequest.current++;
    setProfile(null); setRoutes([]); setStops([]);
    if (!session?.user.id) {
      setProfile(null); setAccessError(null); setRoutes([]); setStops([]); return;
    }
    void retryProfile();
  }, [session?.user.id, retryProfile]);

  const refresh = useCallback(async () => {
    if (!profile) return;
    const request = ++routeRequest.current;
    setLoading(true); setRouteError(null);
    try {
      const data = await loadAssignedStops(profile);
      if (request !== routeRequest.current) return;
      setRoutes(data.routes); setStops(data.stops); setCurrency(data.currency);
    } catch (error) { if (request === routeRequest.current) setRouteError((error as Error).message); }
    finally { if (request === routeRequest.current) setLoading(false); }
  }, [profile]);
  useEffect(() => { void refresh(); }, [refresh]);

  const value = useMemo(() => ({
    session, starting, profile, accessError, retryProfile, routes, stops, currency,
    loading, routeError, notice, setNotice, refresh,
  }), [session, starting, profile, accessError, retryProfile, routes, stops, currency,
    loading, routeError, notice, refresh]);
  return <DriverContext.Provider value={value}>{children}</DriverContext.Provider>;
}

export function useDriver() {
  const context = useContext(DriverContext);
  if (!context) throw new Error('DriverProvider is missing.');
  if (context.profile?.id !== context.session?.user.id) return { ...context, profile: null, routes: [], stops: [], currency: '' };
  return context;
}

