import { useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";

const KEY = "kalane_data";

const makeId = () => crypto.randomUUID();

const seed = {

  users: [
    { id: makeId(), name: "Library Administrator", membershipId: "ADM001", role: "Admin", password: "admin123" },
    { id: makeId(), name: "Mpho Member", membershipId: "MEM001", role: "Member", password: "member123" }
  ],
  transactions: [],
  borrowed: []
};

function loadData() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY));
    if (stored && Array.isArray(stored.books) && Array.isArray(stored.users)) {
      return {
        books: stored.books,
        users: stored.users,
        transactions: Array.isArray(stored.transactions) ? stored.transactions : [],
        borrowed: Array.isArray(stored.borrowed) ? stored.borrowed : []
      };
    }
  } catch (error) {
    console.warn("Could not read saved library data", error);
  }
  return seed;
}

const saveData = (data) => localStorage.setItem(KEY, JSON.stringify(data));

function status(qty) {
  return qty === 0 ? ["Out of stock", "empty"] : qty < 2 ? ["Low stock", "low"] : ["Available", "available"];
}

function escapeText(value) {
  return String(value ?? "");
}

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [data, setData] = useState(loadData);
  const [currentUser, setCurrentUser] = useState(null);
  const [modal, setModal] = useState(null);
  const [toastMessage, setToastMessage] = useState("");
  const [search, setSearch] = useState("");
  const [genre, setGenre] = useState("");

  useEffect(() => {
    saveData(data);
  }, [data]);

  useEffect(() => {
    if (!toastMessage) return undefined;
    const timer = setTimeout(() => setToastMessage(""), 2400);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const toast = (message) => setToastMessage(message);

  const updateData = (updater) => {
    setData((previous) => {
      const next = typeof updater === "function" ? updater(previous) : updater;
      return next;
    });
  };

  const login = (membershipId, password) => {
    const user = data.users.find(
      (item) => item.membershipId === membershipId.trim() && item.password === password
    );
    if (!user) return false;
    setCurrentUser(user);
    navigate("/dashboard");
    return true;
  };

  const logout = () => {
    setCurrentUser(null);
    setModal(null);
    navigate("/login");
  };

  const showPage = (page) => {
    if (!currentUser) return;
    const adminPages = ["dashboard", "catalogue", "manage", "transactions", "users"];
    const memberPages = ["dashboard", "catalogue", "borrowed", "activity"];
    const allowed = currentUser.role === "Admin" ? adminPages : memberPages;
    if (!allowed.includes(page)) {
      toast("You do not have permission to open that page.");
      return;
    }
    navigate(`/${page}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const borrowBook = (bookId) => {
    if (currentUser?.role !== "Member") {
      toast("Only members can borrow books.");
      return;
    }
    const book = data.books.find((item) => item.id === bookId);
    if (!book || book.qty < 1) {
      toast("This book is out of stock.");
      return;
    }
    if (data.borrowed.some((item) => item.membershipId === currentUser.membershipId && item.bookId === bookId && !item.returned)) {
      toast("You already have this book borrowed.");
      return;
    }
    const time = new Date().toLocaleString();
    updateData((previous) => ({
      ...previous,
      books: previous.books.map((item) => item.id === bookId ? { ...item, qty: item.qty - 1 } : item),
      borrowed: [...previous.borrowed, {
        id: makeId(), bookId, bookTitle: book.title, author: book.author, isbn: book.isbn,
        qty: 1, membershipId: currentUser.membershipId, user: currentUser.name, time, returned: false
      }],
      transactions: [...previous.transactions, {
        id: makeId(), bookId, bookTitle: book.title, type: "borrow", qty: 1,
        user: currentUser.name, membershipId: currentUser.membershipId, time
      }]
    }));
    toast("Book borrowed successfully.");
  };

  const returnBook = (borrowId) => {
    const borrowed = data.borrowed.find(
      (item) => item.id === borrowId && item.membershipId === currentUser?.membershipId && !item.returned
    );
    if (!borrowed) return;
    const time = new Date().toLocaleString();
    updateData((previous) => ({
      ...previous,
      books: previous.books.map((book) => book.id === borrowed.bookId ? { ...book, qty: book.qty + borrowed.qty } : book),
      borrowed: previous.borrowed.map((item) => item.id === borrowId ? { ...item, returned: true } : item),
      transactions: [...previous.transactions, {
        id: makeId(), bookId: borrowed.bookId, bookTitle: borrowed.bookTitle, type: "return",
        qty: borrowed.qty, user: currentUser.name, membershipId: currentUser.membershipId, time
      }]
    }));
    toast("Book returned.");
  };

  const stockBook = (bookId, delta) => {
    if (currentUser?.role !== "Admin") return;
    const book = data.books.find((item) => item.id === bookId);
    if (!book) return;
    if (delta < 0 && book.qty < 1) {
      toast("No stock available");
      return;
    }
    updateData((previous) => ({
      ...previous,
      books: previous.books.map((item) => item.id === bookId ? { ...item, qty: Math.max(0, item.qty + delta) } : item),
      transactions: [...previous.transactions, {
        id: makeId(), bookTitle: book.title, type: delta > 0 ? "add" : "borrow", qty: 1,
        user: currentUser.name, time: new Date().toLocaleString(), note: "Admin stock adjustment"
      }]
    }));
    toast(delta > 0 ? "Stock added" : "Stock deducted");
  };

  const deleteBook = (bookId) => {
    if (currentUser?.role !== "Admin") return;
    const book = data.books.find((item) => item.id === bookId);
    if (!book) return;
    if (window.confirm(`Delete "${book.title}"?`)) {
      updateData((previous) => ({ ...previous, books: previous.books.filter((item) => item.id !== bookId) }));
      toast("Book deleted");
    }
  };

  const deleteUser = (userId) => {
    if (currentUser?.role !== "Admin") return;
    const user = data.users.find((item) => item.id === userId);
    if (!user) return;
    if (user.membershipId === "ADM001") {
      toast("The demo administrator cannot be deleted.");
      return;
    }
    if (window.confirm("Delete this user?")) {
      updateData((previous) => ({ ...previous, users: previous.users.filter((item) => item.id !== userId) }));
      toast("Member deleted");
    }
  };

  const saveBook = (form, existingBook) => {
    const book = {
      title: form.title.trim(),
      author: form.author.trim(),
      genre: form.genre.trim(),
      isbn: form.isbn.trim(),
      initialQty: Number(form.initialQty)
    };
    if (existingBook) {
      updateData((previous) => ({
        ...previous,
        books: previous.books.map((item) => item.id === existingBook.id ? { ...item, ...book } : item)
      }));
      toast("Book updated");
    } else {
      updateData((previous) => ({ ...previous, books: [...previous.books, { id: makeId(), ...book, qty: book.initialQty }] }));
      toast("Book added");
    }
    setModal(null);
  };

  const saveUser = (form, existingUser) => {
    const user = {
      name: form.name.trim(), membershipId: form.membershipId.trim(), role: form.role, password: form.password
    };
    if (existingUser) {
      updateData((previous) => ({
        ...previous,
        users: previous.users.map((item) => item.id === existingUser.id ? { ...item, ...user } : item)
      }));
      if (existingUser.id === currentUser.id) setCurrentUser((previous) => ({ ...previous, ...user }));
      toast("Member updated");
    } else {
      updateData((previous) => ({ ...previous, users: [...previous.users, { id: makeId(), ...user }] }));
      toast("Member added");
    }
    setModal(null);
  };

  if (!currentUser) {
    return (
      <>
        <Routes>
          <Route path="/login" element={<LoginPage onLogin={login} />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
        {toastMessage && <Toast message={toastMessage} />}
      </>
    );
  }

  return (
    <>
      <div className="grain" />
      <div id="app">
        <Header user={currentUser} onNavigate={showPage} onLogout={logout} />
        <main>
          <Routes>
            <Route path="/dashboard" element={<Dashboard user={currentUser} data={data} onNavigate={showPage} onBorrow={borrowBook} />} />
            <Route path="/catalogue" element={<Catalogue user={currentUser} data={data} search={search} setSearch={setSearch} genre={genre} setGenre={setGenre} onBorrow={borrowBook} />} />
            {currentUser.role === "Member" && <>
              <Route path="/borrowed" element={<BorrowedPage user={currentUser} data={data} onReturn={returnBook} />} />
              <Route path="/activity" element={<ActivityPage user={currentUser} data={data} />} />
            </>}
            {currentUser.role === "Admin" && <>
              <Route path="/manage" element={<ManagePage data={data} onAdd={() => setModal({ type: "book", item: null })} onEdit={(book) => setModal({ type: "book", item: book })} onDelete={deleteBook} onStock={stockBook} />} />
              <Route path="/transactions" element={<TransactionsPage data={data} />} />
              <Route path="/users" element={<UsersPage data={data} onAdd={() => setModal({ type: "user", item: null })} onEdit={(user) => setModal({ type: "user", item: user })} onDelete={deleteUser} />} />
            </>}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
        <footer><span>KALANE Digital Community Library</span></footer>
      </div>

      <Modal modal={modal} onClose={() => setModal(null)} onSaveBook={saveBook} onSaveUser={saveUser} />
      {toastMessage && <Toast message={toastMessage} />}
    </>
  );
}

function LoginPage({ onLogin }) {
  const [membershipId, setMembershipId] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  const submit = (event) => {
    event.preventDefault();
    const valid = onLogin(membershipId, password);
    if (!valid) setMessage("Invalid membership ID or password.");
  };

  return (
    <div id="loginScreen" className="login-screen">
      <div className="login-visual">
        <div className="seal">K</div>
        <div className="login-copy">
          <span>COMMUNITY LIBRARY</span>
          <h1>Read. Discover. Return.</h1>
          <p>A quiet digital space to discover, borrow and share knowledge.</p>
        </div>
      </div>
      <div className="login-panel">
        <div className="login-brand"><b>KALANE</b><span>DIGITAL COMMUNITY LIBRARY</span></div>
        <h2>Sign in</h2>
        <p className="muted">Use your membership details to continue.</p>
        <form onSubmit={submit}>
          <label>Membership ID<input value={membershipId} onChange={(event) => setMembershipId(event.target.value)} required /></label>
          <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          <button className="btn primary" type="submit">Enter library</button>
        </form>
      </div>
    </div>
  );
}

function Header({ user, onNavigate, onLogout }) {
  const navItems = [
    ["dashboard", "Home"], ["catalogue", "Discover"],
    ...(user.role === "Member" ? [["borrowed", "My Books"], ["activity", "Activity"]] : []),
    ...(user.role === "Admin" ? [["manage", "Collection"], ["transactions", "Circulation"], ["users", "Members"]] : [])
  ];
  const location = useLocation();
  const activePage = location.pathname.replace("/", "") || "dashboard";

  return (
    <header className="site-header">
      <button className="wordmark" onClick={() => onNavigate("dashboard")} aria-label="Go home">
        <span className="mark">K</span><span>KALANE<small>COMMUNITY LIBRARY</small></span>
      </button>
      <nav id="nav">
        {navItems.map(([page, label]) => (
          <button key={page} className={`nav-item ${activePage === page ? "active" : ""}`} onClick={() => onNavigate(page)}>{label}</button>
        ))}
      </nav>
      <div className="header-user">
        <div><strong>{user.name}</strong><small>{user.role.toUpperCase()}</small></div>
        <div className="avatar">{user.name.charAt(0).toUpperCase()}</div>
        <button className="icon-btn" onClick={onLogout}>Sign out</button>
      </div>
    </header>
  );
}

function Dashboard({ user, data, onNavigate, onBorrow }) {
  const mine = data.borrowed.filter((item) => item.membershipId === user.membershipId && !item.returned);
  const available = data.books.filter((book) => book.qty > 0).slice(0, 4);
  const copies = data.books.reduce((sum, book) => sum + Number(book.qty || 0), 0);
  const recent = data.transactions.slice().reverse().slice(0, 5);

  return (
    <section id="dashboard" className="page active-page">
      <div className="welcome">
        <div>
          <h2>{user.role === "Admin" ? <>Good to see you, <span>{escapeText(user.name.split(" ")[0])}.</span></> : <>Find something worth <span>remembering.</span></>}</h2>
          <p>{user.role === "Admin" ? "Manage books, users, inventory and transaction history." : "Explore the community collection and borrow something worth remembering."}</p>
        </div>
        <button className="outline-btn" onClick={() => onNavigate("catalogue")}>Browse collection →</button>
      </div>
      <div className="search-hero"><input placeholder="Search the library by title, author, genre or ISBN…" onFocus={() => onNavigate("catalogue")} /><kbd>SEARCH</kbd></div>
      <div className="stats-grid">
        <div className="stat"><small>Book titles</small><strong>{data.books.length}</strong></div>
        <div className="stat"><small>Available copies</small><strong>{copies}</strong></div>
        <div className="stat"><small>Library users</small><strong>{data.users.length}</strong></div>
        <div className="stat"><small>{user.role === "Admin" ? "Transactions" : "My borrowed"}</small><strong>{user.role === "Admin" ? data.transactions.length : mine.length}</strong></div>
      </div>
      <div className="section-line"><span>AVAILABLE NOW</span><button onClick={() => onNavigate("catalogue")}>See entire collection →</button></div>
      <div className="featured-grid">
        {available.length ? available.map((book) => <BookCard key={book.id} book={book} user={user} onBorrow={() => onBorrow(book.id)} />) : <div className="empty-state">No books are currently available.</div>}
      </div>
      {user.role === "Admin" && <div className="snapshot"><div className="snapshot-head"><span className="kicker">ADMIN NOTEBOOK</span><strong>Latest circulation</strong></div><RecentEvents events={recent} /></div>}
      {user.role === "Member" && <div className="snapshot"><div className="snapshot-head"><span className="kicker">MY SHELF</span><strong>{mine.length} book{mine.length === 1 ? "" : "s"} currently borrowed</strong></div></div>}
    </section>
  );
}

function RecentEvents({ events }) {
  if (!events.length) return <p className="muted">No transactions recorded yet.</p>;
  return <div className="mini-events">{events.map((event) => <div key={event.id}><span>{event.type === "add" ? "STOCK IN" : event.type === "borrow" ? "BORROW" : "RETURN"}</span><strong>{event.bookTitle}</strong><small>{event.user} · {event.time}</small></div>)}</div>;
}

function BookCard({ book, user, onBorrow }) {
  const [label, color] = status(Number(book.qty || 0));
  return (
    <article className="book-card">
      <div className="book-cover"><span>K</span></div>
      <span className={`badge ${color}`}>{label} · {book.qty} available</span>
      <h3>{book.title}</h3>
      <p className="author">{book.author}</p>
      <div className="book-meta"><span>{book.genre}</span><span>ISBN {book.isbn}</span><span>Initial {book.initialQty}</span></div>
      {user.role === "Member" && <button className="btn primary full" disabled={book.qty < 1} onClick={onBorrow}>{book.qty > 0 ? "Borrow this book" : "Out of stock"}</button>}
    </article>
  );
}

function Catalogue({ user, data, search, setSearch, genre, setGenre, onBorrow }) {
  const genres = useMemo(() => [...new Set(data.books.map((book) => book.genre))].sort(), [data.books]);
  const filtered = data.books.filter((book) => (!genre || book.genre === genre) && [book.title, book.author, book.isbn, book.genre].some((value) => String(value).toLowerCase().includes(search.toLowerCase().trim())));
  return (
    <section id="catalogue" className="page active-page">
      <div className="page-intro"><div><h2>Discover books.</h2><p className="muted">Browse title, author, genre, ISBN and original quantity.</p></div><div className="catalog-tools"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search…" /><select value={genre} onChange={(event) => setGenre(event.target.value)}><option value="">All genres</option>{genres.map((item) => <option key={item} value={item}>{item}</option>)}</select></div></div>
      <div className="catalog-grid">{filtered.length ? filtered.map((book) => <BookCard key={book.id} book={book} user={user} onBorrow={() => onBorrow(book.id)} />) : <div className="empty-state">No matching books found.</div>}</div>
    </section>
  );
}

function Table({ headers, rows }) {
  return rows.length ? <div className="table-scroll"><table className="table"><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows}</tbody></table></div> : <div className="empty-state">Nothing to display.</div>;
}

function BorrowedPage({ user, data, onReturn }) {
  const mine = data.borrowed.filter((item) => item.membershipId === user.membershipId && !item.returned);
  return <section id="borrowed" className="page active-page"><div className="page-intro"><div><h2>Books I'm reading.</h2><p className="muted">Your currently borrowed titles.</p></div></div><div className="paper"><Table headers={["BOOK", "AUTHOR", "ISBN", "BORROWED", "QTY", "ACTION"]} rows={mine.map((item) => <tr key={item.id}><td className="book-title">{item.bookTitle}</td><td>{item.author}</td><td>{item.isbn}</td><td>{item.time}</td><td>{item.qty}</td><td><button className="small-btn" onClick={() => onReturn(item.id)}>Return</button></td></tr>)}/></div></section>;
}

function ActivityPage({ user, data }) {
  const list = data.transactions.filter((item) => item.user === user.name || item.membershipId === user.membershipId).slice().reverse();
  return <section id="activity" className="page active-page"><div className="page-intro"><div><h2>My activity.</h2><p className="muted">A record of your borrowing and returns.</p></div></div><div className="paper"><Table headers={["DATE", "BOOK", "ACTION", "QTY"]} rows={list.map((item) => <tr key={item.id}><td>{item.time}</td><td className="book-title">{item.bookTitle}</td><td><span className={`badge ${item.type === "borrow" ? "low" : "available"}`}>{item.type.toUpperCase()}</span></td><td>{item.qty}</td></tr>)}/></div></section>;
}

function ManagePage({ data, onAdd, onEdit, onDelete, onStock }) {
  const low = data.books.filter((book) => book.qty < 2).length;
  return <section id="manage" className="page active-page"><div className="page-intro"><div><h2>Collection.</h2><p className="muted">Manage every title and its stock.</p></div><button className="btn primary" onClick={onAdd}>＋ Add book</button></div><div className="admin-summary"><div className="admin-stat"><span>Total titles</span><strong>{data.books.length}</strong></div><div className="admin-stat"><span>Available copies</span><strong>{data.books.reduce((sum, book) => sum + book.qty, 0)}</strong></div><div className="admin-stat"><span>Low/out of stock</span><strong>{low}</strong></div></div><div className="paper"><Table headers={["TITLE", "AUTHOR", "GENRE", "ISBN", "INITIAL", "STOCK", "ACTIONS"]} rows={data.books.map((book) => { const [label, color] = status(book.qty); return <tr key={book.id}><td className="book-title">{book.title}</td><td>{book.author}</td><td>{book.genre}</td><td>{book.isbn}</td><td>{book.initialQty}</td><td><span className={`badge ${color}`}>{book.qty} · {label}</span></td><td><div className="actions"><button className="small-btn" onClick={() => onEdit(book)}>Update</button><button className="small-btn" onClick={() => onStock(book.id, 1)}>＋ Stock</button><button className="small-btn" onClick={() => onStock(book.id, -1)}>− Stock</button><button className="small-btn danger" onClick={() => onDelete(book.id)}>Delete</button></div></td></tr>; })}/></div></section>;
}

function TransactionsPage({ data }) {
  const transactions = data.transactions.slice().reverse();
  return <section id="transactions" className="page active-page"><div className="page-intro"><div><h2>Circulation.</h2><p className="muted">Every stock movement and borrowing event.</p></div></div><div className="paper"><Table headers={["DATE", "BOOK", "ACTION", "QTY", "USER"]} rows={transactions.map((item) => <tr key={item.id}><td>{item.time}</td><td className="book-title">{item.bookTitle}</td><td><span className={`badge ${item.type === "borrow" ? "low" : "available"}`}>{item.type === "add" ? "STOCK IN" : item.type.toUpperCase()}</span></td><td>{item.qty}</td><td>{item.user}</td></tr>)}/></div></section>;
}

function UsersPage({ data, onAdd, onEdit, onDelete }) {
  return <section id="users" className="page active-page"><div className="page-intro"><div><h2>Members.</h2><p className="muted">Registered users and their roles.</p></div><button className="btn primary" onClick={onAdd}>＋ Add member</button></div><div className="paper"><Table headers={["NAME", "MEMBERSHIP ID", "ROLE", "ACTIONS"]} rows={data.users.map((user) => <tr key={user.id}><td className="book-title">{user.name}</td><td>{user.membershipId}</td><td><span className="role-pill">{user.role}</span></td><td><div className="actions"><button className="small-btn" onClick={() => onEdit(user)}>Update</button><button className="small-btn danger" onClick={() => onDelete(user.id)}>Delete</button></div></td></tr>)}/></div></section>;
}

function Modal({ modal, onClose, onSaveBook, onSaveUser }) {
  if (!modal) return null;
  const isBook = modal.type === "book";
  return <div id="modal" className="modal"><div className="modal-backdrop" onClick={onClose}></div><div className="modal-card"><button className="modal-close" onClick={onClose}>×</button>{isBook ? <BookForm book={modal.item} onClose={onClose} onSave={onSaveBook} /> : <UserForm user={modal.item} onClose={onClose} onSave={onSaveUser} />}</div></div>;
}

function BookForm({ book, onClose, onSave }) {
  const [form, setForm] = useState({ title: book?.title || "", author: book?.author || "", genre: book?.genre || "", isbn: book?.isbn || "", initialQty: book?.initialQty ?? 0 });
  const update = (key, value) => setForm((previous) => ({ ...previous, [key]: value }));
  return <><span className="kicker">ADMINISTRATION</span><h2>{book ? "Update book" : "Add new book"}</h2><form onSubmit={(event) => { event.preventDefault(); onSave(form, book); }}><label>Title<input value={form.title} onChange={(event) => update("title", event.target.value)} required /></label><label>Author<input value={form.author} onChange={(event) => update("author", event.target.value)} required /></label><label>Genre<input value={form.genre} onChange={(event) => update("genre", event.target.value)} required /></label><label>ISBN<input value={form.isbn} onChange={(event) => update("isbn", event.target.value)} required /></label><label>Initial quantity<input type="number" min="0" value={form.initialQty} onChange={(event) => update("initialQty", event.target.value)} required /></label><div className="modal-actions"><button className="btn" type="button" onClick={onClose}>Cancel</button><button className="btn primary">Save book</button></div></form></>;
}

function UserForm({ user, onClose, onSave }) {
  const [form, setForm] = useState({ name: user?.name || "", membershipId: user?.membershipId || "", role: user?.role || "Member", password: user?.password || "" });
  const update = (key, value) => setForm((previous) => ({ ...previous, [key]: value }));
  return <><span className="kicker">ADMINISTRATION</span><h2>{user ? "Update member" : "Add member"}</h2><form onSubmit={(event) => { event.preventDefault(); onSave(form, user); }}><label>Full name<input value={form.name} onChange={(event) => update("name", event.target.value)} required /></label><label>Membership ID<input value={form.membershipId} onChange={(event) => update("membershipId", event.target.value)} required /></label><label>Role<select value={form.role} onChange={(event) => update("role", event.target.value)}><option value="Member">Member</option><option value="Admin">Admin</option></select></label><label>Password<input type="password" value={form.password} onChange={(event) => update("password", event.target.value)} required /></label><div className="modal-actions"><button className="btn" type="button" onClick={onClose}>Cancel</button><button className="btn primary">Save member</button></div></form></>;
}

function Toast({ message }) {
  return <div id="toast" className="toast show">{message}</div>;
}

export default App;
