import { Hono } from "hono";
import { auth } from "../auth";

const authRoutes = new Hono();

authRoutes.post("/sign-in/social", (c) => {
    return auth.handler(c.req.raw);
});

authRoutes.post("/sign-out", (c) => {
    return auth.handler(c.req.raw);
});

authRoutes.get("/callback/*", (c) => {
    return auth.handler(c.req.raw);
});

authRoutes.get("/get-session/*", (c) => {
    return auth.handler(c.req.raw);
});

// INFO: non better-auth endpoint
authRoutes.get("/is-authenticated", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    return c.json({
        authenticated: session !== null,
    });
});

authRoutes.get("/*", async (c) => {
    return auth.handler(c.req.raw);
});

authRoutes.post("/*", async (c) => {
    return auth.handler(c.req.raw);
});


export type AuthRoutesType = typeof authRoutes;

export default authRoutes;


// TODO: move somewhere else