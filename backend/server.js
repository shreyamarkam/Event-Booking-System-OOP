const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { exec } = require("child_process");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ✅ IMPORTANT: USE ABSOLUTE PATH WITH QUOTES
const CPP_PATH = '"D:/OOP Project/cpp/booking.exe"';

// ================= EVENTS =================
app.get("/events", (req, res) => {
    exec(`${CPP_PATH} events`, (err, stdout, stderr) => {

        if (err) {
            console.error("Events error:", err);
            return res.json([]);
        }

        if (!stdout || stdout.trim() === "") {
            return res.json([]);
        }

        // ✅ FIX: PARSE USING |
        const data = stdout.trim().split("\n").map(line => {
            const parts = line.split("|");

            if (parts.length < 6) return null;

            return {
                id: Number(parts[0]),
                name: parts[1],
                date: parts[2],
                venue: parts[3],
                price: Number(parts[4]),
                seats: Number(parts[5])
            };
        }).filter(e => e !== null);

        res.json(data);
    });
});

// ================= BOOK =================
app.post("/book", (req, res) => {
    const { user, eventId, seats } = req.body;

    exec(`${CPP_PATH} book ${eventId} ${user} ${seats}`, (err, stdout) => {
        if (err) {
            console.error(err);
            return res.send("FAILED");
        }

        res.send(stdout.trim());
    });
});

// ================= CANCEL =================
app.post("/cancel", (req, res) => {
    const { user, eventId, seats } = req.body;

    exec(`${CPP_PATH} cancel ${user} ${eventId} ${seats}`, (err, stdout) => {
        if (err) {
            console.error(err);
            return res.send("FAILED");
        }

        res.send(stdout.trim());
    });
});

// ================= HISTORY =================
app.get("/history", (req, res) => {
    exec(`${CPP_PATH} history`, (err, stdout, stderr) => {

        if (err) {
            console.error("History error:", err);
            return res.json([]);
        }

        if (!stdout || stdout.trim() === "") {
            return res.json([]);
        }

        const data = stdout.trim().split("\n").map(line => {
            const parts = line.trim().split(" ");

            if (parts[0] === "CANCEL") {
                return {
                    type: "cancel",
                    user: parts[1],
                    eventId: Number(parts[2]),
                    seats: Number(parts[3])
                };
            }

            return {
                type: "book",
                user: parts[0],
                eventId: Number(parts[1]),
                seats: Number(parts[2])
            };
        });

        res.json(data);
    });
});

// ================= ADD EVENT =================
app.post("/addEvent", (req, res) => {
    const { name, date, venue, price, seats } = req.body;

    // ✅ FIX: HANDLE SPACES WITH QUOTES
    exec(`${CPP_PATH} add "${name}" "${date}" "${venue}" ${price} ${seats}`, 
    (err, stdout, stderr) => {

        if (err) {
            console.error("Add event error:", err);
            return res.send("ERROR");
        }

        res.send(stdout.trim());
    });
});

// ================= START SERVER =================
app.listen(3000, () => {
    console.log("🚀 Server running!");
    console.log("👉 API: http://localhost:3000");
    console.log("👉 Open UI: file:///D:/OOP Project/frontend/index.html");
    exec('start "" "D:/OOP Project/frontend/index.html"');
});