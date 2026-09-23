from pathlib import Path
path = Path('/home/ubuntu/aleppo-center-cash/client/src/pages/Home.tsx')
text = path.read_text()
text = text.replace(
    'onClick={onAddPayment}><Plus size={18} /> إضافة دفعة</button></div><div className="currency-summary-grid">',
    'onClick={onEditAccount}><Pencil size={15} /> تعديل الحساب</button><button className="primary-btn" onClick={onAddPayment}><Plus size={18} /> إضافة دفعة</button></div></div><div className="currency-summary-grid">',
    1,
)
text = text.replace(
    'function PaymentRow({ payment, accountName, compact, onDelete }: { payment: Payment; accountName?: string; compact?: boolean; onDelete?: () => void }) {',
    'function PaymentRow({ payment, accountName, compact, onEdit, onDelete }: { payment: Payment; accountName?: string; compact?: boolean; onEdit?: () => void; onDelete?: () => void }) {',
)
text = text.replace(
    'onDelete={() => onDeletePayment(payment.id)} />)',
    'onEdit={() => onEditPayment(payment)} onDelete={() => onDeletePayment(payment.id)} />)',
    1,
)
text = text.replace(
    '{!compact && <button className="delete-btn" onClick={onDelete} aria-label="حذف الدفعة"><Trash2 size={16} /></button>}',
    '{!compact && <><button className="delete-btn" onClick={onEdit} aria-label="تعديل الدفعة"><Pencil size={15} /></button><button className="delete-btn" onClick={onDelete} aria-label="حذف الدفعة"><Trash2 size={16} /></button></>}',
)
text = text.replace(
    'onClose={() => setShowPaymentModal(false)}',
    'onClose={() => { setShowPaymentModal(false); setEditingPaymentId(null); }}',
    1,
)
text = text.replace(
    'title={`دفعة جديدة — ${selectedAccount?.name ?? "الحساب"}`}',
    'title={`${editingPaymentId ? "تعديل الدفعة" : "دفعة جديدة"} — ${selectedAccount?.name ?? "الحساب"}`}',
    1,
)
text = text.replace(
    '>حفظ الدفعة <Check size={17} />',
    '>{editingPaymentId ? "حفظ التعديل" : "حفظ الدفعة"} <Check size={17} />',
    1,
)
text = text.replace(
    'title="إضافة حساب جديد" onClose={() => setShowAccountModal(false)}',
    'title={editingAccountId ? "تعديل الحساب" : "إضافة حساب جديد"} onClose={() => { setShowAccountModal(false); setEditingAccountId(null); setNewAccountName(""); setNewAccountOwner(""); }}',
    1,
)
text = text.replace(
    '>إضافة الحساب <Plus size={17} />',
    '>{editingAccountId ? "حفظ التعديل" : "إضافة الحساب"} <Plus size={17} />',
    1,
)
path.write_text(text)
