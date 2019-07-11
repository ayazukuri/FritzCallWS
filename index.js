const express = require("express");
const fritz = require("fritzbox.js");
const { createInterface } = require("readline");
const https = require("https");
const fs = require("fs");
const config = require("./config.json");

const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});
rl.on("line", async input => {
    try {
        console.log(eval(input));
    } catch (e) {
        console.error(e);
    }
});

function log(text) {
    const date = new Date().toString();
    const time = date.split(" ").slice(4, 5).join(" ");
    const day = date.split(" ").slice(1, 3).join(" ");
    console.log(`[${day} ${time}] ${text}`);
}

const app = express();
app.use(express.json());
const httpsServer = https.createServer({ key: fs.readFileSync("./ssl/domain.key", "utf8"), cert: fs.readFileSync("./ssl/domain.crt") }, app);
httpsServer.listen(config.port, () => {
    log("HTTPS server listening on port " + config.port);
});
const expressWs = require("express-ws")(app, httpsServer);

let monitor;
let options;
const sockets = new Map();

app.ws("/", async (ws, req) => {
    let data = req.headers;
    if (!data.username || !data.password) {
        ws.send(JSON.stringify({
            statusCode: 400,
            status: "Invalid arguments"
        }));
        ws.close();
        return;
    }
    if (!monitor) {
        options = {
            username: data.username,
            password: data.password,
            server: "fritz.box",
            protocol: "https",
            callmonitorport: 1012
        }
        try {
            global.sessionId = await fritz.getSessionId(options);
            monitor = new fritz.CallMonitor(options);
            monitor.on("inbound", call => {
                log(`Call received from ${call.caller}`);
                for (const [id, socket] of sockets) {
                    socket.send(JSON.stringify({
                        type: "call",
                        data: call
                    }));
                }
            });
            ws.id = new Date().getTime();
            sockets.set(ws.id, ws);
            log(`Websocket ${ws.id} connected`);
        } catch (e) {
            options = undefined;
            monitor = undefined;
            ws.send(JSON.stringify({
                statusCode: 401,
                status: "Invalid login information"
            }));
            ws.close();
            return;
        }
    } else {
        if (options.username !== data.username || options.password !== data.password) {
            ws.send(JSON.stringify({
                statusCode: 401,
                status: "Invalid login information"
            }));
            ws.close();
            return;
        }
        ws.id = new Date().getTime();
        sockets.set(ws.id, ws);
        log(`Websocket ${ws.id} connected`);
    }
    ws.on("close", () => {
        sockets.delete(ws.id);
        log(`Websocket ${ws.id} disconnected`);
    });
});

