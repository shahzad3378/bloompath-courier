import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv, hasSupabaseEnv } from "@/lib/env";
import { homeForRole, internalRoles, type Profile } from "@/lib/roles";

const publicRoutes = new Set(["/login", "/forgot-password"]);

function isProtected(pathname: string) {
  return ["/dashboard", "/users", "/shippers", "/shipper", "/driver"].some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

function loginRedirect(request: NextRequest, reason?: string) {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  if (request.nextUrl.pathname !== "/") {
    url.searchParams.set("redirect", request.nextUrl.pathname);
  }
  if (reason) url.searchParams.set("error", reason);
  return NextResponse.redirect(url);
}

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (!hasSupabaseEnv()) {
    return isProtected(pathname)
      ? loginRedirect(request, "setup")
      : NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const { url, publishableKey } = getSupabaseEnv();
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { data, error } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;

  if (!userId || error) {
    return isProtected(pathname) ? loginRedirect(request) : response;
  }

  const { data: profileData } = await supabase
    .from("profiles")
    .select("id, organization_id, full_name, email, phone, employee_code, role, status, can_delete_shipments")
    .eq("id", userId)
    .maybeSingle();
  const profile = profileData as Profile | null;

  if (!profile || profile.status !== "active") {
    return isProtected(pathname) ? loginRedirect(request, "access") : response;
  }

  if (publicRoutes.has(pathname)) {
    return NextResponse.redirect(new URL(homeForRole(profile.role), request.url));
  }

  if (
    ["/dashboard", "/users", "/shippers"].some(
      (route) => pathname === route || pathname.startsWith(`${route}/`),
    ) &&
    !internalRoles.includes(profile.role)
  ) {
    return NextResponse.redirect(new URL(homeForRole(profile.role), request.url));
  }

  if (pathname.startsWith("/shipper") && profile.role !== "shipper") {
    return NextResponse.redirect(new URL(homeForRole(profile.role), request.url));
  }

  if (pathname.startsWith("/driver") && profile.role !== "driver") {
    return NextResponse.redirect(new URL(homeForRole(profile.role), request.url));
  }

  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
