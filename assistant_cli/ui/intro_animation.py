"""
Matrix Digital Rain intro animation with UBONGO text reveal.

Uses curses for terminal graphics:
  1. Matrix-style green rain falls for ~3 seconds
  2. Rain converges into the word "UBONGO" (big ASCII art)
  3. Brief glow/pulse, then clear and launch chat
"""

import curses
import random
import time

# ── ASCII art for UBONGO ──────────────────────────────────────────────────
UBONGO_ART = [
    "██    ██ ██████   ██████  ███    ██  ██████   ██████ ",
    "██    ██ ██   ██ ██    ██ ████   ██ ██       ██    ██",
    "██    ██ ██████  ██    ██ ██ ██  ██ ██  ███  ██    ██",
    "██    ██ ██   ██ ██    ██ ██  ██ ██ ██   ██  ██    ██",
    " ██████  ██████   ██████  ██   ████  ██████   ██████ ",
]

# Katakana-ish + digits for authentic Matrix feel
MATRIX_CHARS = (
    "アイウエオカキクケコサシスセソタチツテトナニヌネノ"
    "ハヒフヘホマミムメモヤユヨラリルレロワヲン"
    "0123456789"
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    "ﾊﾐﾋｰｳｼﾅﾓﾆｻﾜﾂｵﾘｱﾎﾃﾏｹﾒｴｶｷﾑﾕﾗｾﾈｽﾀﾇﾍ"
    "∀∂∃∅∆∇∈∉∋∏∑−∕∗∘√∝∞∠∧∨∩∪"
)

# Simpler fallback chars for terminals that don't support unicode well
FALLBACK_CHARS = (
    "0123456789"
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    "abcdefghijklmnopqrstuvwxyz"
    "!@#$%^&*()_+-=[]{}|;:',.<>?"
)


def _random_char(use_unicode: bool = True) -> str:
    chars = MATRIX_CHARS if use_unicode else FALLBACK_CHARS
    return random.choice(chars)


def _init_colors(stdscr):
    """Set up green color palette for the rain effect."""
    curses.start_color()
    curses.use_default_colors()

    # Color pairs: 1=bright green, 2=dim green, 3=white (head), 4=dark green
    curses.init_pair(1, curses.COLOR_GREEN, -1)     # normal green
    curses.init_pair(2, curses.COLOR_GREEN, -1)      # dim green (same, use A_DIM)
    curses.init_pair(3, curses.COLOR_WHITE, -1)      # bright white head
    curses.init_pair(4, curses.COLOR_GREEN, -1)      # base green


def _run_matrix_rain(stdscr, duration: float = 3.0):
    """Phase 1: Matrix digital rain."""
    curses.curs_set(0)
    stdscr.nodelay(True)
    stdscr.timeout(50)
    _init_colors(stdscr)

    max_y, max_x = stdscr.getmaxyx()
    if max_y < 10 or max_x < 20:
        return  # terminal too small

    # Test unicode support
    use_unicode = True
    try:
        stdscr.addstr(0, 0, "ア")
        stdscr.clear()
    except Exception:
        use_unicode = False

    # Rain columns: each has a y-position (head), speed, and trail length
    num_cols = max_x
    columns = []
    for x in range(num_cols):
        columns.append({
            "y": random.randint(-max_y, 0),
            "speed": random.randint(1, 3),
            "trail": random.randint(5, max_y // 2),
            "chars": [_random_char(use_unicode) for _ in range(max_y)],
        })

    start_time = time.time()
    frame = 0

    while time.time() - start_time < duration:
        # Check for keypress to skip
        key = stdscr.getch()
        if key != -1:
            break

        for x, col in enumerate(columns):
            head_y = col["y"]
            trail_len = col["trail"]

            # Draw trail
            for i in range(trail_len + 1):
                draw_y = head_y - i
                if 0 <= draw_y < max_y and 0 <= x < max_x - 1:
                    try:
                        if i == 0:
                            # Head: bright white
                            stdscr.addstr(
                                draw_y, x,
                                _random_char(use_unicode),
                                curses.color_pair(3) | curses.A_BOLD,
                            )
                        elif i < 3:
                            # Near head: bright green
                            stdscr.addstr(
                                draw_y, x,
                                col["chars"][draw_y % max_y],
                                curses.color_pair(1) | curses.A_BOLD,
                            )
                        elif i < trail_len // 2:
                            # Mid trail: normal green
                            stdscr.addstr(
                                draw_y, x,
                                col["chars"][draw_y % max_y],
                                curses.color_pair(1),
                            )
                        else:
                            # Tail: dim green
                            stdscr.addstr(
                                draw_y, x,
                                col["chars"][draw_y % max_y],
                                curses.color_pair(2) | curses.A_DIM,
                            )
                    except curses.error:
                        pass

            # Erase tail end
            erase_y = head_y - trail_len - 1
            if 0 <= erase_y < max_y and 0 <= x < max_x - 1:
                try:
                    stdscr.addstr(erase_y, x, " ")
                except curses.error:
                    pass

            # Move column down
            col["y"] += col["speed"]

            # Reset when fully off screen
            if col["y"] - col["trail"] > max_y:
                col["y"] = random.randint(-max_y // 2, -1)
                col["speed"] = random.randint(1, 3)
                col["trail"] = random.randint(5, max_y // 2)

            # Randomly mutate characters for that flickering effect
            if frame % 3 == 0:
                idx = random.randint(0, max_y - 1)
                col["chars"][idx] = _random_char(use_unicode)

        stdscr.refresh()
        frame += 1
        time.sleep(0.04)

    return use_unicode


def _rain_to_ubongo(stdscr, use_unicode: bool = True):
    """Phase 2: Rain converges into UBONGO text."""
    max_y, max_x = stdscr.getmaxyx()

    art_height = len(UBONGO_ART)
    art_width = max(len(line) for line in UBONGO_ART)

    # Center the text
    start_y = max(0, (max_y - art_height) // 2)
    start_x = max(0, (max_x - art_width) // 2)

    if start_y + art_height > max_y or start_x + art_width > max_x:
        # Terminal too small for the art — use simple text
        simple = "UBONGO"
        sy = max_y // 2
        sx = max(0, (max_x - len(simple)) // 2)
        stdscr.clear()
        try:
            stdscr.addstr(sy, sx, simple, curses.color_pair(1) | curses.A_BOLD)
        except curses.error:
            pass
        stdscr.refresh()
        time.sleep(1.5)
        return

    # Collect target positions (where the UBONGO chars are)
    target_cells = []
    for row_i, line in enumerate(UBONGO_ART):
        for col_i, ch in enumerate(line):
            if ch != " ":
                target_cells.append((start_y + row_i, start_x + col_i, ch))

    # Create rain drops that will converge to target positions
    drops = []
    for ty, tx, tch in target_cells:
        drops.append({
            "x": random.randint(0, max_x - 2),
            "y": random.randint(-max_y, -1),
            "tx": tx,
            "ty": ty,
            "ch": tch,
            "arrived": False,
        })

    # Animate convergence over ~30 frames
    total_frames = 30
    for frame in range(total_frames + 1):
        key = stdscr.getch()
        if key != -1:
            break

        progress = frame / total_frames
        # Ease-in-out curve
        ease = progress * progress * (3 - 2 * progress)

        stdscr.clear()

        for drop in drops:
            # Interpolate position
            cur_x = int(drop["x"] + (drop["tx"] - drop["x"]) * ease)
            cur_y = int(drop["y"] + (drop["ty"] - drop["y"]) * ease)

            if 0 <= cur_y < max_y and 0 <= cur_x < max_x - 1:
                try:
                    if progress < 0.7:
                        # Still raining — show random chars
                        ch = _random_char(use_unicode)
                        attr = curses.color_pair(1) | curses.A_BOLD
                    else:
                        # Settling — show the actual character
                        ch = drop["ch"]
                        attr = curses.color_pair(3) | curses.A_BOLD
                    stdscr.addstr(cur_y, cur_x, ch, attr)
                except curses.error:
                    pass

        # Also draw some background rain for atmosphere
        if progress < 0.8:
            for _ in range(int(max_x * (1 - progress))):
                rx = random.randint(0, max_x - 2)
                ry = random.randint(0, max_y - 1)
                try:
                    stdscr.addstr(
                        ry, rx,
                        _random_char(use_unicode),
                        curses.color_pair(2) | curses.A_DIM,
                    )
                except curses.error:
                    pass

        stdscr.refresh()
        time.sleep(0.05)

    # Final: show clean UBONGO in bright green
    stdscr.clear()
    for row_i, line in enumerate(UBONGO_ART):
        y = start_y + row_i
        if 0 <= y < max_y:
            x = start_x
            for col_i, ch in enumerate(line):
                if 0 <= x + col_i < max_x - 1:
                    try:
                        if ch != " ":
                            stdscr.addstr(
                                y, x + col_i, ch,
                                curses.color_pair(1) | curses.A_BOLD,
                            )
                    except curses.error:
                        pass
    stdscr.refresh()


def _pulse_ubongo(stdscr):
    """Phase 3: Pulse/glow the UBONGO text."""
    max_y, max_x = stdscr.getmaxyx()

    art_height = len(UBONGO_ART)
    art_width = max(len(line) for line in UBONGO_ART)
    start_y = max(0, (max_y - art_height) // 2)
    start_x = max(0, (max_x - art_width) // 2)

    # Subtitle
    subtitle = "[ Initializing... ]"
    sub_x = max(0, (max_x - len(subtitle)) // 2)
    sub_y = start_y + art_height + 2

    # Pulse: alternate bright white and green
    for pulse in range(4):
        attr = (
            curses.color_pair(3) | curses.A_BOLD
            if pulse % 2 == 0
            else curses.color_pair(1) | curses.A_BOLD
        )

        for row_i, line in enumerate(UBONGO_ART):
            y = start_y + row_i
            if 0 <= y < max_y:
                for col_i, ch in enumerate(line):
                    if ch != " " and 0 <= start_x + col_i < max_x - 1:
                        try:
                            stdscr.addstr(y, start_x + col_i, ch, attr)
                        except curses.error:
                            pass

        # Show subtitle
        if 0 <= sub_y < max_y:
            try:
                stdscr.addstr(
                    sub_y, sub_x, subtitle,
                    curses.color_pair(2) | curses.A_DIM,
                )
            except curses.error:
                pass

        stdscr.refresh()
        time.sleep(0.25)

    # Hold for a moment
    time.sleep(0.5)


def _animation_main(stdscr):
    """Main curses animation sequence."""
    try:
        use_unicode = _run_matrix_rain(stdscr, duration=3.0)
        if use_unicode is None:
            use_unicode = False
        _rain_to_ubongo(stdscr, use_unicode)
        _pulse_ubongo(stdscr)
    except KeyboardInterrupt:
        pass


def play_intro():
    """Play the full intro animation. Safe to call — handles errors gracefully."""
    try:
        curses.wrapper(_animation_main)
    except Exception:
        # If curses fails (e.g. not a real terminal), just skip
        pass
