/* eslint-disable react-hooks/set-state-in-effect -- Clear driver-owned data on identity/route changes. */
import { useCallback,useEffect,useRef,useState } from 'react';
import { useDriver } from './driver-context';
import type { Profile } from './courier';
export function useDriverQuery<T>(loader:(profile:Profile)=>Promise<T>) {
 const {profile}=useDriver();const [data,setData]=useState<T|null>(null);const [owner,setOwner]=useState<string|null>(null);const [loading,setLoading]=useState(false);const [error,setError]=useState<string|null>(null);const sequence=useRef(0);
 const refresh=useCallback(async()=>{if(!profile)return;const request=++sequence.current;setLoading(true);setError(null);try{const value=await loader(profile);if(request===sequence.current){setData(value);setOwner(profile.id);}}catch(e){if(request===sequence.current)setError((e as Error).message);}finally{if(request===sequence.current)setLoading(false);}},[profile,loader]);
 useEffect(()=>{setData(null);setOwner(null);void refresh();// The request counter deliberately invalidates all work after unmount or an identity change.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 return()=>{sequence.current++;};},[refresh]);
 return {data:owner===profile?.id?data:null,loading,error,refresh};
}
