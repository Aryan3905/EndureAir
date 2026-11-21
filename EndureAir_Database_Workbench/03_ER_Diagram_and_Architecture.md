# EndureAir Database Architecture, ER Model & Normalization Proof (Revised Plan)

## 1. Problem & System Overview
An airline booking is not a single database write—it is a multi-step sequence across two independent systems:
1. **Hold** the seat in the booking database (`status = 'HELD'`, 60-second TTL expiry) and enqueue a payment intent in the **Transactional Outbox**.
2. **Charge** the customer through an external **Payment Gateway** using an **Idempotency Key**.
3. **Confirm** the booking in the database via an atomic conditional update (`sp_atomic_confirm_booking`) only if the hold is still valid; otherwise flag the payment for refund.
4. **Reconcile** any crash or timeout discrepancies using the **Booking Journal**, **TTL Reaper**, and **5-Row Reconciler Decision Table**.

---

## 2. Entity-Relationship (ER) Diagram (DBMS Unit 2)

* **Weak Entity**: `seats` is a weak entity identified by `(flight_id, seat_no)` belonging to strong entity `flights`.
* **1:1 Relationships**: `bookings` has a strict 1:1 relationship with `seats` (`UNIQUE(seat_id)`) and `payments` (`UNIQUE(payment_id)`).

```
 +------------------+          1:M (Owner)         +------------------------------+
 |     flights      |----------------------------->|      seats (Weak Entity)     |
 |------------------|                              |------------------------------|
 | PK: flight_id    |                              | PK: id                       |
 | UK: flight_number|                              | UK: (flight_id, seat_no)     |
 |     origin       |                              | FK: holder_id -> users       |
 |     destination  |                              |     status (AVAIL/HELD/BOOK) |
 +------------------+                              |     hold_expires_at (TTL)    |
                                                   |     version (Optimistic CAS) |
 +------------------+                              +------------------------------+
 |      users       |                                             |
 |------------------|                                             | 1:1 (Confirmed)
 | PK: user_id      |--------------------+                        v
 |     user_name    |                    |         +------------------------------+
 | UK: email        |                    |         |           bookings           |
 +------------------+                    +-------->|------------------------------|
          |                                        | PK: id                       |
          | 1:M                                    | UK: seat_id                  |
          v                                        | UK: payment_id               |
 +------------------+         1:1 (Outbox)         | UK: idempotency_key          |
 | idempotency_keys |----------------------------->|     status (CONFIRMED/CANC)  |
 |------------------|                              +------------------------------+
 | PK: idem_key     |                                             ^
 |     user_id      |                                             | 1:1 (Reconciled)
 |     request_hash |         1:1 (Gateway)        +------------------------------+
 |     status       |----------------------------->|           payments           |
 +------------------+                              |------------------------------|
                                                   | PK: payment_id               |
                                                   | UK: idempotency_key          |
                                                   |     amount, status, mode     |
                                                   +------------------------------+
```

---

## 3. Functional Dependencies & Formal Normalization Proof (DBMS Unit 4)

### 3.1 Listed Functional Dependencies ($F$)
1. **`users`**:
   - $\text{user\_id} \rightarrow \text{user\_name}, \text{email}, \text{role}, \text{created\_at}$
   - $\text{email} \rightarrow \text{user\_id}$ (Candidate Key)
2. **`flights`**:
   - $\text{flight\_id} \rightarrow \text{flight\_number}, \text{origin}, \text{destination}, \text{departure\_time}, \text{total\_cabin\_seats}, \text{flight\_status}$
   - $\text{flight\_number} \rightarrow \text{flight\_id}$ (Candidate Key)
3. **`seats`**:
   - $\text{id} \rightarrow \text{flight\_id}, \text{seat\_no}, \text{status}, \text{holder\_id}, \text{passenger\_name}, \text{hold\_expires\_at}, \text{version}$
   - $(\text{flight\_id}, \text{seat\_no}) \rightarrow \text{id}$ (Composite Candidate Key)
4. **`idempotency_keys`**:
   - $\text{idempotency\_key} \rightarrow \text{user\_id}, \text{seat\_no}, \text{request\_hash}, \text{status}, \text{response\_payload}, \text{created\_at}$
5. **`payments`**:
   - $\text{payment\_id} \rightarrow \text{idempotency\_key}, \text{user\_id}, \text{seat\_no}, \text{amount}, \text{status}, \text{gateway\_mode}, \text{created\_at}$
   - $\text{idempotency\_key} \rightarrow \text{payment\_id}$ (Candidate Key)
6. **`bookings`**:
   - $\text{id} \rightarrow \text{seat\_id}, \text{flight\_id}, \text{seat\_no}, \text{user\_id}, \text{payment\_id}, \text{idempotency\_key}, \text{status}, \text{created\_at}$
   - $\text{seat\_id} \rightarrow \text{id}$, $\text{payment\_id} \rightarrow \text{id}$, $\text{idempotency\_key} \rightarrow \text{id}$ (All Candidate Keys)

### 3.2 Normal Form Verification (1NF, 2NF, 3NF, BCNF)
* **1NF**: Every attribute in every relation holds an atomic scalar value.
* **2NF**: Every non-prime attribute is fully functionally dependent on the whole candidate key (no partial dependencies on `(flight_id, seat_no)`).
* **3NF / BCNF**: For every non-trivial functional dependency $X \rightarrow Y$ in the core relational tables (`users`, `flights`, `idempotency_keys`, `payments`), the determinant $X$ is a **superkey** of that relation. (Note: `passenger_name` is cached as a display denormalization on `seats`/`bookings` for single-query boarding pass rendering; removing `passenger_name` in strict projection yields pure BCNF across all relations).

### 3.3 Fourth Normal Form (4NF) & Multivalued Dependencies ($MVD$)
If a passenger can select multiple independent **meal dietary options** ($\text{user\_id} \twoheadrightarrow \text{meal\_code}$) AND have multiple independent **checked baggage tags** ($\text{user\_id} \twoheadrightarrow \text{baggage\_tag\_code}$), storing both in a single table `(user_id, meal_code, baggage_tag_code)` creates a cross-product redundancy violating **4NF**.
We decompose them into two independent 4NF relations:
1. `passenger_meal_choices(user_id, meal_code)`
2. `passenger_baggage_tags(user_id, baggage_tag_code, weight_kg)`

---

## 4. Reconciler Decision Table & 4 Golden Invariants (DBMS Unit 5)

### 4.1 Reconciler Decision Table
| Gateway Ledger (`payments`) | Booking Database (`seats` / `bookings`) | Reconciler Action |
| :--- | :--- | :--- |
| `CHARGED` | Hold valid (`status='HELD'`, `hold_expires_at > NOW()`), no booking | **Confirm the booking** (`CONFIRMED_BOOKING`) |
| `CHARGED` | Hold expired or seat taken by another user, no booking | **Refund payment** (`REFUNDED_LATE_PAYMENT`) |
| `CHARGED` | Confirmed booking already exists | **Nothing to do** (`NO_OP` — idempotent) |
| `NOT CHARGED` | Hold expired (`hold_expires_at <= NOW()`) | **Release seat to `AVAILABLE`** (`RELEASED_EXPIRED_HOLD`) |
| `REFUNDED` | Confirmed booking exists | **Cancel the booking** (`CANCELLED_REFUNDED_BOOKING`) |

### 4.2 The 4 Correctness Invariants
1. **Invariant 1**: Every `CHARGED` payment has **exactly one confirmed booking** OR is **refunded**.
2. **Invariant 2**: No seat has two confirmed bookings (`UNIQUE(seat_id)`).
3. **Invariant 3**: No hold remains past its expiry after reaper/reconciler execution.
4. **Invariant 4**: No `idempotency_key` produces two charges (`UNIQUE(idempotency_key)`).
