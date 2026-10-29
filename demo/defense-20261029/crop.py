"""Crop real UI screenshots (3200x1800, 2x) into slide-ready regions."""
from PIL import Image
import os
K = 3200 / 1200  # boxes below are measured on 1200-wide previews
BOX = {
    "bills":      ("10-chat-bills", (425, 45, 962, 478)),
    "yellow":     ("17-chat-yellow", (390, 60, 965, 480)),
    "otp":        ("19-otp", (420, 116, 780, 558)),
    "birthday":   ("14-chat-birthday-done", (390, 85, 970, 485)),
    "injection":  ("22-chat-injection", (390, 60, 970, 250)),
    "sandbox":    ("23-chat-sandbox", (390, 60, 970, 250)),
    "dag":        ("42-dag", (441, 66, 936, 306)),
    "process":    ("40-inline-process", (390, 66, 966, 540)),
    "red":        ("18-chat-red", (390, 60, 965, 480)),
    "aa":         ("16-chat-aa", (390, 60, 965, 480)),
    "recurring":  ("21-chat-recurring", (390, 60, 965, 480)),
    "clarify":    ("15-chat-clarify", (390, 60, 965, 250)),
    "home-cards": ("45-workspace-home", (395, 60, 965, 400)),
}
MAIN = (162, 0, 1200, 675)  # page without sidebar
PAGES = ["01-dashboard", "02-bills", "03-wealth", "04-cards", "05-subscriptions",
         "06-planner", "07-security", "24-planner-after", "43-approvals", "44-activity", "45-workspace-home"]
os.makedirs("crops", exist_ok=True)
def crop(src, box, name):
    im = Image.open(f"shots/{src}.png").convert("RGB")
    b = tuple(round(v * K) for v in box)
    im.crop(b).save(f"crops/{name}.png", optimize=True)
    print(name, b)
for name, (src, box) in BOX.items():
    crop(src, box, name)
for p in PAGES:
    crop(p, MAIN, "page-" + p.split("-", 1)[1])
for p in ["00-login", "45-workspace-home", "01-dashboard", "14-chat-birthday-done"]:
    Image.open(f"shots/{p}.png").convert("RGB").save(f"crops/full-{p.split('-',1)[1]}.png", optimize=True)
# wide thumbnails (~2.3:1) for the six-scenario grid and appendix
WIDE = {
    "w-aa": ("16-chat-aa", (390, 128, 965, 378)),
    "w-bills": ("02-bills", (162, 40, 1200, 490)),
    "w-wealth": ("03-wealth", (162, 40, 1200, 490)),
    "w-cards": ("04-cards", (162, 40, 1200, 490)),
    "w-recurring": ("21-chat-recurring", (390, 40, 965, 290)),
    "w-planner": ("24-planner-after", (162, 40, 1200, 490)),
    "w-anomaly": ("10-chat-bills", (425, 285, 962, 470)),
}
for name, (src, box) in WIDE.items():
    crop(src, box, name)
# tighter crops (~1.7:1 or content-only) so screenshots can be shown larger
TIGHT = {
    "t-aa": ("16-chat-aa", (400, 100, 965, 462)),
    "t-cover": ("14-chat-birthday-done", (365, 78, 985, 492)),
    "t-bills": ("02-bills", (190, 60, 975, 520)),
    "t-wealth": ("03-wealth", (190, 55, 1180, 640)),
    "t-cards": ("04-cards", (190, 60, 1180, 560)),
    "t-recurring": ("21-chat-recurring", (390, 40, 965, 375)),
    "t-planner": ("24-planner-after", (190, 60, 1180, 640)),
    "t-yellow": ("17-chat-yellow", (425, 62, 962, 478)),
    "t-chatbills": ("10-chat-bills", (425, 45, 962, 478)),
    "t-dag": ("42-dag", (578, 112, 788, 294)),
    "t-security": ("07-security", (170, 40, 1200, 450)),
    "t-activity": ("44-activity", (170, 40, 1200, 560)),
}
for name, (src, box) in TIGHT.items():
    crop(src, box, name)
