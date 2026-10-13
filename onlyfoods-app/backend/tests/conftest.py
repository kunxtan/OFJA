import os
import sys

# ให้ import โมดูลใน backend/ ได้ และตั้งค่า env ขั้นต่ำ (เทสต์ชุดนี้ไม่ต้องใช้ MySQL)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("JWT_SECRET", "test-secret-test-secret-test-secret-123456")
os.environ.setdefault("UPLOAD_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "_uploads"))
