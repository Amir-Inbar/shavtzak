// MCP server for the שבצ״ק roster: read and change the real board, then publish it (encrypted) to GitHub Pages.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as ops from './ops';

const INSTRUCTIONS = `Manages the company duty roster (שבצ״ק) published at ${ops.SITE}.
The real board (names!) lives only in the local file data/board.json – never commit it; the site only gets an encrypted copy.
Workflow: shavtzak_board (see the table) → change with shavtzak_assign / shavtzak_assign_many / shavtzak_update_people / shavtzak_edit_person
→ shavtzak_check (rules) → shavtzak_publish. After publishing, the manager opens the site and taps "טען".
Names are forgiving: short board names (ישי), full names (ישי ניסים) or last names all work; ambiguous names return an error listing candidates.
Days: YYYY-MM-DD or Hebrew weekday (שלישי). Times: the shift's start (13:00). Posts with roles (סיור: מפקד/נהג/חיילים, כרמל: מפקד/חיילים) need a role.
A table cell like "נח, עמיחי" under חיילים = people ["נח","עמיחי"]; "-" means empty/continuing.
Listening hours inside כרמל ("23:00 - בוריס") go to the post "מאזין" (day = the Carmel day, time = the hour), and those people must also be in כרמל חיילים.`;

const server = new McpServer({ name: 'shavtzak', version: '1.0.0' }, { instructions: INSTRUCTIONS });
const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });
const safe = <A,>(fn: (a: A) => string | Promise<string>) => async (a: A) => {
  try { return text(await fn(a)); } catch (e) { return { ...text(`שגיאה: ${(e as Error).message}`), isError: true }; }
};
const cell = { post: z.string().describe('עמדה, למשל סיור / כרמל / תורן / מאזין'), day: z.string().describe('YYYY-MM-DD או שם יום, למשל רביעי'), time: z.string().optional().describe('שעת התחלת המשמרת, למשל 13:00 (לא צריך בעמדה עם משמרת אחת)'), role: z.string().optional().describe('תפקיד בעמדות עם תפקידים: מפקד / נהג / חיילים') };

server.registerTool('shavtzak_board', { description: 'The whole board as a table (day, hours, every post and role), plus posts and period.', inputSchema: {} },
  safe(() => ops.boardText(ops.load())));
server.registerTool('shavtzak_people', { description: 'Everyone on the roster grouped by rank, with platoon, qualifications, shift count and unavailability.', inputSchema: {} },
  safe(() => ops.peopleText(ops.load())));
server.registerTool('shavtzak_check', { description: 'Rule problems on the board: empty seats, overlaps, unavailable people, short rest, missing qualification.', inputSchema: {} },
  safe(() => ops.checkText(ops.load())));

server.registerTool('shavtzak_assign', { description: 'Put people into one cell (replaces who is there, or mode=add). Empty people list clears it.', inputSchema: { ...cell, people: z.array(z.string()), mode: z.enum(['replace', 'add']).optional() } },
  safe(a => ops.change(s => ops.assign(s, a))));
server.registerTool('shavtzak_assign_many', { description: 'Fill many cells at once – e.g. a whole table sent as an image or text. Applied in order; stops at the first error without saving.', inputSchema: { items: z.array(z.object({ ...cell, people: z.array(z.string()), mode: z.enum(['replace', 'add']).optional() })) } },
  safe(({ items }) => ops.change(s => items.map(it => ops.assign(s, it)).join('\n'))));
server.registerTool('shavtzak_clear', { description: 'Empty one cell (post/day/time/role) or, with all=true, every assignment on the board.', inputSchema: { post: z.string().optional(), day: z.string().optional(), time: z.string().optional(), role: z.string().optional(), all: z.boolean().optional() } },
  safe(a => ops.change(s => ops.clearSlots(s, a))));
server.registerTool('shavtzak_fill', { description: 'Auto-fill empty seats with free, rested, qualified people (optionally only one post or day).', inputSchema: { post: z.string().optional(), day: z.string().optional() } },
  safe(a => ops.change(s => ops.fill(s, a))));

server.registerTool('shavtzak_update_people', {
  description: 'Add/update people from a list in the sheet format: headings מפקדים / נהגים / לוחמים / מסופחים, lines like "סאפר (מחלקה 1)". Existing people are updated (matched by short/full name), not duplicated. remove = names to delete.',
  inputSchema: { list: z.string(), remove: z.array(z.string()).optional() },
}, safe(a => ops.change(s => ops.updatePeople(s, a.list, a.remove))));
server.registerTool('shavtzak_edit_person', {
  description: 'Change one person: rename, rank (לוחם/נהג/מפקד/סמל/קצין), platoon, qualifications, note, unavailability windows (dates YYYY-MM-DD or ISO date-time).',
  inputSchema: { name: z.string(), newName: z.string().optional(), rank: z.string().optional(), team: z.string().optional(), addQuals: z.array(z.string()).optional(), removeQuals: z.array(z.string()).optional(), note: z.string().optional(), unavailable: z.array(z.object({ from: z.string(), to: z.string(), reason: z.string().optional() })).optional(), clearUnavailable: z.boolean().optional() },
}, safe(a => ops.change(s => ops.editPerson(s, a))));

server.registerTool('shavtzak_set_period', { description: 'Which days the board shows: start (YYYY-MM-DD or weekday) and number of days (1–14).', inputSchema: { start: z.string(), days: z.number() } },
  safe(a => ops.change(s => ops.setPeriod(s, a.start, a.days))));
server.registerTool('shavtzak_get_posts', { description: 'Posts (עמדות) as JSON: shifts, roles, rest/blocking rules. Edit and send back with shavtzak_set_posts.', inputSchema: {} },
  safe(() => JSON.stringify(ops.load().posts, null, 1)));
server.registerTool('shavtzak_set_posts', { description: 'Replace all posts with this JSON array (same shape as shavtzak_get_posts). Keep ids to keep assignments.', inputSchema: { posts: z.array(z.any()) } },
  safe(a => ops.change(s => ops.setPosts(s, a.posts))));

server.registerTool('shavtzak_publish', { description: 'Encrypt the board and push it to GitHub Pages. The manager then taps "טען" on the site.', inputSchema: { message: z.string().optional() } },
  safe(a => ops.publish(a.message)));
server.registerTool('shavtzak_pull_from_site', { description: 'Replace the local board with the latest published one from the site.', inputSchema: {} },
  safe(() => ops.pullFromSite()));

await server.connect(new StdioServerTransport());
