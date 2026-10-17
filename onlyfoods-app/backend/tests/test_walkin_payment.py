"""walk-in เลือกวิธีชำระได้ (เงินสด / PromptPay / TrueMoney) ; ลูกค้าออนไลน์ยังห้ามเงินสด"""
import pytest

from errors import DomainError
from routers.orders import _resolve_payment_method


def test_walk_in_methods():
    assert _resolve_payment_method(None, True) == "CASH"          # ค่าเริ่มต้นของ walk-in = เงินสด
    assert _resolve_payment_method("Cash", True) == "CASH"
    assert _resolve_payment_method("PromptPay", True) == "QR_PROMPTPAY"
    assert _resolve_payment_method("TrueMoney", True) == "MOBILE_BANKING"
    with pytest.raises(DomainError):
        _resolve_payment_method("CreditCard", True)


def test_online_cannot_pay_cash():
    assert _resolve_payment_method(None, False) == "QR_PROMPTPAY"
    with pytest.raises(DomainError):
        _resolve_payment_method("Cash", False)
