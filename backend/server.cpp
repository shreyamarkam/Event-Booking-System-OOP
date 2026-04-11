/*
 * ╔══════════════════════════════════════════════════════════╗
 * ║         TicketFlow — C++ HTTP Backend Server             ║
 * ║         OOP Project · NIT Silchar                        ║
 * ║                                                          ║
 * ║  Compile: g++ -o server server.cpp -lws2_32 (Windows)    ║
 * ║  Run    : .\server.exe  (from inside backend/ folder)    ║
 * ║  Open   : http://localhost:3000  (auto-launches)         ║
 * ╚══════════════════════════════════════════════════════════╝
 *
 *  Folder structure:
 *    OOP Project/
 *      backend/    ← server.cpp + server.exe live here
 *      data/       ← events.txt, tickets.txt
 *      frontend/   ← index.html, style.css, script.js
 */

#ifdef _WIN32
    #define _WIN32_WINNT 0x0601
    #include <winsock2.h>
    #include <ws2tcpip.h>
    #pragma comment(lib, "ws2_32.lib")
    typedef int socklen_t;
    #define CLOSE_SOCKET closesocket
#else
    #include <sys/socket.h>
    #include <netinet/in.h>
    #include <unistd.h>
    #define SOCKET int
    #define INVALID_SOCKET -1
    #define SOCKET_ERROR   -1
    #define CLOSE_SOCKET   close
#endif

#include <iostream>
#include <fstream>
#include <sstream>
#include <vector>
#include <string>
#include <algorithm>
#include <cstring>

const std::string EVENTS_FILE  = "../data/events.txt";
const std::string TICKETS_FILE = "../data/tickets.txt";
const std::string FRONTEND_DIR = "../frontend/";
const int         PORT         = 3000;

// ═════════════════════════════════════════════
//  DATA MODEL
// ═════════════════════════════════════════════
struct Event {
    int id, seats, price;
    std::string name, date, venue;
};

// ═════════════════════════════════════════════
//  BOOKING SYSTEM
// ═════════════════════════════════════════════
class BookingSystem {
    std::vector<Event> events;

    void loadEvents() {
        events.clear();
        std::ifstream f(EVENTS_FILE);
        if (!f) {
            std::cerr << "  [ERROR] Cannot open: " << EVENTS_FILE << "\n"
                      << "  Run server.exe from inside the backend/ folder!\n";
            return;
        }
        std::string line;
        while (std::getline(f, line)) {
            // Strip \r if present (Windows line endings)
            if (!line.empty() && line.back() == '\r') line.pop_back();
            if (line.empty()) continue;
            if ((int)std::count(line.begin(), line.end(), '|') < 5) continue;
            try {
                Event e;
                std::string tmp;
                std::istringstream ss(line);
                std::getline(ss, tmp,     '|'); e.id    = std::stoi(tmp);
                std::getline(ss, e.name,  '|');
                std::getline(ss, e.date,  '|');
                std::getline(ss, e.venue, '|');
                std::getline(ss, tmp,     '|'); e.price = std::stoi(tmp);
                std::getline(ss, tmp,     '|'); e.seats = std::stoi(tmp);
                // Trim any trailing \r from seats string
                if (!tmp.empty() && tmp.back() == '\r') tmp.pop_back();
                e.seats = std::stoi(tmp);
                events.push_back(e);
            } catch (...) {
                std::cerr << "  [WARN] Skipping malformed line: " << line << "\n";
            }
        }
        std::cout << "  [OK] Loaded " << events.size() << " event(s)\n";
    }

    void saveEvents() {
        std::ofstream f(EVENTS_FILE);
        for (auto& e : events)
            f << e.id    << "|" << e.name  << "|" << e.date  << "|"
              << e.venue << "|" << e.price << "|" << e.seats << "\n";
    }

public:
    std::string getEventsJSON() {
        loadEvents();
        if (events.empty()) return "[]";
        std::ostringstream out;
        out << "[";
        for (size_t i = 0; i < events.size(); ++i) {
            const auto& e = events[i];
            if (i) out << ",";
            out << "{"
                << "\"id\":"      << e.id    << ","
                << "\"name\":\""  << e.name  << "\","
                << "\"date\":\""  << e.date  << "\","
                << "\"venue\":\"" << e.venue << "\","
                << "\"price\":"   << e.price << ","
                << "\"seats\":"   << e.seats
                << "}";
        }
        out << "]";
        return out.str();
    }

    std::string book(int eventId, const std::string& user, int seats) {
        std::cout << "  [BOOK] eventId=" << eventId
                  << " user=" << user << " seats=" << seats << "\n";
        loadEvents();
        for (auto& e : events) {
            if (e.id == eventId) {
                std::cout << "  [BOOK] Found event '" << e.name
                          << "' seats available=" << e.seats << "\n";
                if (e.seats >= seats) {
                    e.seats -= seats;
                    saveEvents();
                    std::ofstream f(TICKETS_FILE, std::ios::app);
                    if (!f) return "FILE_ERROR";
                    f << user << " " << eventId << " " << seats << "\n";
                    std::cout << "  [BOOKED] OK\n";
                    return "BOOKED";
                } else {
                    std::cout << "  [BOOK] Not enough seats\n";
                    return "FAILED";
                }
            }
        }
        std::cout << "  [BOOK] Event not found\n";
        return "FAILED";
    }

    std::string cancel(const std::string& user, int eventId, int seats) {
        loadEvents();
        std::vector<std::string> keep;
        std::ifstream fin(TICKETS_FILE);
        if (!fin) return "NOT_FOUND";

        std::string u; int eid, s;
        bool found = false;
        while (fin >> u >> eid >> s) {
            if (!found && u == user && eid == eventId && s == seats) {
                found = true;
                for (auto& e : events)
                    if (e.id == eventId) e.seats += seats;
            } else {
                keep.push_back(u + " " + std::to_string(eid) + " " + std::to_string(s));
            }
        }
        fin.close();
        if (!found) return "NOT_FOUND";

        std::ofstream fout(TICKETS_FILE);
        for (auto& l : keep) fout << l << "\n";
        saveEvents();
        std::cout << "  [CANCELLED] " << user << " x" << seats << "\n";
        return "CANCELLED";
    }

    std::string getHistoryJSON() {
        loadEvents();
        std::ifstream f(TICKETS_FILE);
        if (!f) return "[]";

        std::string u; int eid, s;
        std::ostringstream out;
        out << "[";
        bool first = true;
        while (f >> u >> eid >> s) {
            if (!first) out << ",";
            first = false;
            std::string evName = "Unknown";
            for (auto& e : events) if (e.id == eid) evName = e.name;
            out << "{"
                << "\"type\":\"book\","
                << "\"user\":\""      << u      << "\","
                << "\"eventId\":"     << eid    << ","
                << "\"eventName\":\"" << evName << "\","
                << "\"seats\":"       << s
                << "}";
        }
        out << "]";
        return out.str();
    }

    std::string addEvent(const std::string& name, const std::string& date,
                         const std::string& venue, int price, int seats) {
        loadEvents();
        int newId = events.empty() ? 1 : events.back().id + 1;
        std::ofstream f(EVENTS_FILE, std::ios::app);
        if (!f) return "FILE_ERROR";
        f << newId << "|" << name << "|" << date << "|"
          << venue << "|" << price << "|" << seats << "\n";
        std::cout << "  [ADDED] Event: " << name << "\n";
        return "EVENT_ADDED";
    }
};

// ═════════════════════════════════════════════
//  HTTP HELPERS
// ═════════════════════════════════════════════

// Extract a value from a JSON string by key name
// Handles both "key": "string" and "key": number
static std::string jsonGet(const std::string& body, const std::string& key) {
    std::string needle = "\"" + key + "\"";
    size_t pos = body.find(needle);
    if (pos == std::string::npos) return "";
    pos = body.find(':', pos + needle.size());
    if (pos == std::string::npos) return "";
    ++pos;
    // Skip whitespace
    while (pos < body.size() && (body[pos]==' '||body[pos]=='\t'||body[pos]=='\r'||body[pos]=='\n')) ++pos;
    if (pos >= body.size()) return "";

    if (body[pos] == '"') {
        // String value
        ++pos;
        std::string val;
        while (pos < body.size() && body[pos] != '"') {
            if (body[pos] == '\\') ++pos;
            if (pos < body.size()) val += body[pos++];
        }
        return val;
    } else {
        // Number or bool — read until delimiter
        size_t end = pos;
        while (end < body.size() && body[end]!=',' && body[end]!='}' &&
               body[end]!='\r' && body[end]!='\n') ++end;
        std::string val = body.substr(pos, end - pos);
        // Trim
        size_t a = val.find_first_not_of(" \t");
        size_t b = val.find_last_not_of(" \t\r\n");
        return (a == std::string::npos) ? "" : val.substr(a, b - a + 1);
    }
}

static std::string readFile(const std::string& path) {
    std::ifstream f(path, std::ios::binary);
    if (!f) return "";
    std::ostringstream ss;
    ss << f.rdbuf();
    return ss.str();
}

static std::string httpResponse(int code, const std::string& ct, const std::string& body) {
    std::string status = code==200 ? "200 OK" : code==404 ? "404 Not Found" : "500 Error";
    std::ostringstream r;
    r << "HTTP/1.1 " << status << "\r\n"
      << "Content-Type: "   << ct   << "\r\n"
      << "Access-Control-Allow-Origin: *\r\n"
      << "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
      << "Access-Control-Allow-Headers: Content-Type\r\n"
      << "Content-Length: " << body.size() << "\r\n"
      << "Connection: close\r\n\r\n"
      << body;
    return r.str();
}

static std::string jsonResp(const std::string& b){ return httpResponse(200,"application/json",b); }
static std::string textResp(const std::string& b){ return httpResponse(200,"text/plain",b); }
static std::string htmlResp(const std::string& b){ return httpResponse(200,"text/html",b); }
static std::string cssResp (const std::string& b){ return httpResponse(200,"text/css",b); }
static std::string jsResp  (const std::string& b){ return httpResponse(200,"application/javascript",b); }

// ═════════════════════════════════════════════
//  REQUEST PARSER  — reads headers + body properly
// ═════════════════════════════════════════════
struct HttpRequest {
    std::string method, path, body;
    int contentLength = 0;
};

static HttpRequest parseRequest(const std::string& raw) {
    HttpRequest req;

    // First line: METHOD PATH HTTP/1.1
    size_t lineEnd = raw.find("\r\n");
    if (lineEnd == std::string::npos) lineEnd = raw.find("\n");
    if (lineEnd == std::string::npos) return req;

    std::istringstream firstLine(raw.substr(0, lineEnd));
    std::string proto;
    firstLine >> req.method >> req.path >> proto;

    // Strip query string
    size_t q = req.path.find('?');
    if (q != std::string::npos) req.path = req.path.substr(0, q);

    // Find the blank line separating headers from body (\r\n\r\n)
    size_t headerEnd = raw.find("\r\n\r\n");
    if (headerEnd == std::string::npos) {
        // Fallback: try \n\n
        headerEnd = raw.find("\n\n");
        if (headerEnd == std::string::npos) return req;
        req.body = raw.substr(headerEnd + 2);
    } else {
        req.body = raw.substr(headerEnd + 4);
    }

    // Read Content-Length from headers so we know exact body size
    std::string headers = raw.substr(0, headerEnd);
    // Case-insensitive search for content-length
    std::string headersLower = headers;
    std::transform(headersLower.begin(), headersLower.end(), headersLower.begin(), ::tolower);
    size_t clPos = headersLower.find("content-length:");
    if (clPos != std::string::npos) {
        size_t valStart = clPos + 15;
        while (valStart < headers.size() && headers[valStart] == ' ') ++valStart;
        size_t valEnd = headers.find("\r\n", valStart);
        if (valEnd == std::string::npos) valEnd = headers.find("\n", valStart);
        std::string clStr = headers.substr(valStart, valEnd - valStart);
        try { req.contentLength = std::stoi(clStr); } catch (...) {}
    }

    // Trim body to Content-Length if we have it
    if (req.contentLength > 0 && (int)req.body.size() > req.contentLength)
        req.body = req.body.substr(0, req.contentLength);

    return req;
}

// ═════════════════════════════════════════════
//  REQUEST HANDLER
// ═════════════════════════════════════════════
static BookingSystem bs;

static std::string handleRequest(const std::string& raw) {
    HttpRequest req = parseRequest(raw);

    std::cout << "  --> " << req.method << " " << req.path << "\n";
    if (!req.body.empty())
        std::cout << "  --> body: " << req.body << "\n";

    if (req.method == "OPTIONS")
        return httpResponse(200, "text/plain", "");

    // ── Static files ────────────────────────
    if (req.method == "GET" && (req.path == "/" || req.path == "/index.html")) {
        std::string c = readFile(FRONTEND_DIR + "index.html");
        return c.empty() ? httpResponse(404,"text/plain","index.html not found") : htmlResp(c);
    }
    if (req.method == "GET" && req.path == "/style.css") {
        std::string c = readFile(FRONTEND_DIR + "style.css");
        return c.empty() ? httpResponse(404,"text/plain","style.css not found") : cssResp(c);
    }
    if (req.method == "GET" && req.path == "/script.js") {
        std::string c = readFile(FRONTEND_DIR + "script.js");
        return c.empty() ? httpResponse(404,"text/plain","script.js not found") : jsResp(c);
    }

    // ── API ──────────────────────────────────
    if (req.method == "GET" && req.path == "/events")  return jsonResp(bs.getEventsJSON());
    if (req.method == "GET" && req.path == "/history") return jsonResp(bs.getHistoryJSON());

    if (req.method == "POST" && req.path == "/book") {
        std::string user = jsonGet(req.body, "user");
        std::string eid  = jsonGet(req.body, "eventId");
        std::string s    = jsonGet(req.body, "seats");
        std::cout << "  --> parsed: user='" << user
                  << "' eventId='" << eid << "' seats='" << s << "'\n";
        int eventId = eid.empty() ? 0 : std::stoi(eid);
        int seats   = s.empty()   ? 0 : std::stoi(s);
        return textResp(bs.book(eventId, user, seats));
    }

    if (req.method == "POST" && req.path == "/cancel") {
        std::string user = jsonGet(req.body, "user");
        std::string eid  = jsonGet(req.body, "eventId");
        std::string s    = jsonGet(req.body, "seats");
        int eventId = eid.empty() ? 0 : std::stoi(eid);
        int seats   = s.empty()   ? 0 : std::stoi(s);
        return textResp(bs.cancel(user, eventId, seats));
    }

    if (req.method == "POST" && req.path == "/addEvent") {
        std::string name  = jsonGet(req.body, "name");
        std::string date  = jsonGet(req.body, "date");
        std::string venue = jsonGet(req.body, "venue");
        std::string p     = jsonGet(req.body, "price");
        std::string s     = jsonGet(req.body, "seats");
        int price = p.empty() ? 0 : std::stoi(p);
        int seats = s.empty() ? 0 : std::stoi(s);
        return textResp(bs.addEvent(name, date, venue, price, seats));
    }

    return httpResponse(404, "text/plain", "Not Found");
}

// ═════════════════════════════════════════════
//  MAIN
// ═════════════════════════════════════════════
int main() {
#ifdef _WIN32
    WSADATA wsa;
    if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) {
        std::cerr << "WSAStartup failed\n"; return 1;
    }
#endif

    SOCKET serverSock = socket(AF_INET, SOCK_STREAM, 0);
    if (serverSock == INVALID_SOCKET) { std::cerr << "socket() failed\n"; return 1; }

    int opt = 1;
    setsockopt(serverSock, SOL_SOCKET, SO_REUSEADDR, (char*)&opt, sizeof(opt));

    sockaddr_in addr{};
    addr.sin_family      = AF_INET;
    addr.sin_addr.s_addr = INADDR_ANY;
    addr.sin_port        = htons(PORT);

    if (bind(serverSock, (sockaddr*)&addr, sizeof(addr)) == SOCKET_ERROR) {
        std::cerr << "bind() failed — port " << PORT << " already in use?\n";
        CLOSE_SOCKET(serverSock); return 1;
    }

    listen(serverSock, 10);

    std::cout << "\n";
    std::cout << "╔══════════════════════════════════════════╗\n";
    std::cout << "║   TicketFlow C++ Server  · port " << PORT << "    ║\n";
    std::cout << "║   NIT Silchar · OOP Project              ║\n";
    std::cout << "╚══════════════════════════════════════════╝\n\n";
    std::cout << "  Events  : " << EVENTS_FILE  << "\n";
    std::cout << "  Tickets : " << TICKETS_FILE << "\n";
    std::cout << "  Frontend: " << FRONTEND_DIR << "\n\n";

    {
        std::ifstream ef(EVENTS_FILE);
        std::ifstream ff(FRONTEND_DIR + "index.html");
        std::cout << (ef ? "  [OK] data/events.txt found\n"
                         : "  [ERR] data/events.txt NOT found — run from backend/!\n");
        std::cout << (ff ? "  [OK] frontend/index.html found\n"
                         : "  [ERR] frontend/index.html NOT found\n");
    }

    std::cout << "\n  Open: http://localhost:" << PORT << "\n\n";

#ifdef _WIN32
    system("start http://localhost:3000");
#elif __APPLE__
    system("open http://localhost:3000");
#else
    system("xdg-open http://localhost:3000");
#endif

    std::cout << "  Waiting for requests...\n\n";

    while (true) {
        sockaddr_in clientAddr{};
        socklen_t clientLen = sizeof(clientAddr);
        SOCKET clientSock = accept(serverSock, (sockaddr*)&clientAddr, &clientLen);
        if (clientSock == INVALID_SOCKET) continue;

        // Read full request — loop until we have the complete body
        std::string raw;
        char buf[4096];
        int received;
        while ((received = recv(clientSock, buf, sizeof(buf)-1, 0)) > 0) {
            buf[received] = '\0';
            raw += std::string(buf, received);

            // Check if we have the full request by comparing body size to Content-Length
            size_t headerEnd = raw.find("\r\n\r\n");
            if (headerEnd == std::string::npos) continue;

            // Get Content-Length
            std::string headersLower = raw.substr(0, headerEnd);
            std::transform(headersLower.begin(), headersLower.end(), headersLower.begin(), ::tolower);
            size_t clPos = headersLower.find("content-length:");
            if (clPos == std::string::npos) break; // No body expected (GET)

            size_t valStart = clPos + 15;
            while (valStart < headersLower.size() && headersLower[valStart]==' ') ++valStart;
            size_t valEnd = headersLower.find("\r\n", valStart);
            int contentLength = 0;
            try { contentLength = std::stoi(headersLower.substr(valStart, valEnd-valStart)); }
            catch (...) { break; }

            int bodyReceived = (int)raw.size() - (int)(headerEnd + 4);
            if (bodyReceived >= contentLength) break; // Got full body
        }

        if (!raw.empty()) {
            std::string response = handleRequest(raw);
            send(clientSock, response.c_str(), (int)response.size(), 0);
        }

        CLOSE_SOCKET(clientSock);
    }

    CLOSE_SOCKET(serverSock);
#ifdef _WIN32
    WSACleanup();
#endif
    return 0;
}