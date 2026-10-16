# Librarian guide

Sign in with your registered account. An administrator must grant the librarian role before **Librarian** appears. Keep your session on a staff device and sign out after your shift. Use **Refresh records** when another staff member has been working; the database rechecks every action even if your screen is stale.

## Approve students

Open **Librarian → Memberships** and filter to pending. Compare full name, roll number, programme and department with your authorised departmental records. Approve, reject or suspend using the confirmation screen. Email verification and librarian approval are separate. An approved student whose email is unverified still cannot borrow. You cannot approve your own membership; ask another staff member.

Suspension/rejection cancels pending requests and reservations. Existing loans remain visible and must still be returned. Staff access is separate: ask an administrator to revoke it for a departing librarian. If a student edits identity information, their membership returns to pending for rechecking.

## Enter real catalogue records

Open **Catalogue → Add title**, enter title and authors (required) and known bibliographic metadata. Leave unknown fields blank; do not invent details. Save. Then choose **Add physical copy**, choose the title and enter the accession exactly from the register, including leading zeroes, punctuation and any meaningful spaces. Set shelf and condition. Each physical copy needs its own unique accession.

Book IDs distinguish bibliographic titles; ISBN is not assumed unique. Add several copies under the same title. Editing a title updates its displayed bibliography. Editing a copy changes shelf, condition, inventory status or acquisition date. Accession numbers are immutable. For a mistaken accession, withdraw the incorrect record and add the correctly accessioned copy; keep a note in departmental records. Do not reuse historical accession numbers.

Damaged, withdrawn, missing or lost copies cannot circulate. A copy on loan or actively reserved must first be returned or its reservation released before a restrictive inventory edit. A damaged physical return should be recorded with **Damaged** at check-in. Repair can later be recorded by changing its condition to good/worn. For a lost book still on loan, preserve the active loan and refer the case to the department; only record physical return after receipt. The app does not implement write-offs or fines.

## Import CSV

1. Open **CSV import → Download empty template**. Each data row represents one physical copy. Required: title, authors, accession_number. Use comma-separated UTF-8 CSV; quote values containing commas/newlines.
2. Keep accession numbers and ISBNs as Text in your spreadsheet before typing/pasting. Otherwise leading zeroes may already be lost before the app sees the file. Do not trim accession spaces.
3. Leave book_id blank for import to group identical bibliographic metadata. For additional copies of an existing title, copy its book UUID from catalogue management and provide the same metadata. All metadata must match when an explicit UUID is supplied.
4. Use `good`, `worn`, or `damaged` for physical_condition; `active`, `withdrawn`, `missing`, or `lost` for inventory_status. Blank values default to good/active. Use four-digit publication years (1000–2200) and YYYY-MM-DD acquisition dates.
5. Select a file with at most 500 rows and 2 MB. Inspect the preview. Download rejected rows if needed, correct them in the original source and preview again. Remove the diagnostic `errors` and `csv_row` columns from rejected-row downloads before re-import.
6. Commit only a fully valid batch and confirm. The database validates again; a conflict aborts the entire batch. Identical repeated accessions are skipped; changed existing records must be edited explicitly, never silently overwritten. Refresh catalogue management to verify the result.

Do not import the fictional test fixtures from the test suite as departmental holdings. No sample production records are supplied.

## Review requests and collect books

Requests do not issue books. In **Requests**, inspect the student and accession, add an optional review note and choose Approve or Reject. Approve reserves the available copy for the configured collection period. More than one student may have pending requests, but only one can be approved for a copy. A competing librarian may win a reservation first; refresh after an availability error.

At collection, open the reservation's **Record collection** link or **Checkout**. Verify the student's identity and physical accession. Select the reservation, or choose an approved student and available copy for direct checkout. A reserved copy requires the matching reservation. Optionally choose a due date; otherwise the configured loan period applies. Check the verification box, choose **Record checkout**, inspect the confirmation, and confirm only while handing over the book.

The loan is created atomically. Other pending requests for the issued copy are rejected with a recorded reason. Approved reservations count toward borrowing limits. A suspended/unverified student or a damaged/unavailable copy cannot be issued even if the page previously showed availability.

## Receive books and monitor due dates

Open **Check-in**, search the accession or student, inspect the book and select Good/Worn/Damaged. Choose **Record check-in** and confirm actual receipt. A returned damaged book stays unavailable. Repeated check-in attempts are rejected.

**Active & overdue** shows borrowers and due dates. Filter to overdue when needed. Set a new future due date and confirm to record an authorised extension; the previous value remains in audit history. Times are displayed in your browser's timezone, so departmental devices should use Asia/Kolkata. The system does not email reminders or calculate fines.

## Export and hand over

**Reports** downloads catalogue CSV, exact catalogue JSON, active loans, overdue loans, all loan history and requests. Student information is private: store circulation exports only in restricted departmental storage. CSV is formula-escaped for safer spreadsheet use; JSON preserves original catalogue strings. Do not treat reports as full backups. Ask the project owner to follow [DEPLOYMENT.md](DEPLOYMENT.md) for full backup/restore and administrator succession.

If an action fails, read the message, refresh, and inspect whether another operator changed the record before retrying. If the network fails after a confirmation, inspect the resulting record before repeating the action. Never lend a book on the assumption that a failed screen recorded checkout.
