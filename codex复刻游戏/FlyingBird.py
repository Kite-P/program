"""
Flying Bird - Standalone Python / pygame version
Controls:
  Space / Left mouse: flap or start/restart
  P: pause
  R: restart
  Esc: quit
This version matches the HTML gameplay style and uses a local save file for best score.
"""
from __future__ import annotations

import json
import math
import os
import random
import sys
from dataclasses import dataclass

try:
    import pygame
except ImportError:  # friendly message when run before installing pygame
    print("This game needs pygame. Install it with: python -m pip install pygame")
    raise

W, H = 480, 720
GROUND_H = 92
GROUND_Y = H - GROUND_H
SAVE_KEY = "flying_bird_save.json"

MENU, PLAYING, PAUSED, GAME_OVER, RESET_CONFIRM = range(5)


def app_dir() -> str:
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


def save_path() -> str:
    return os.path.join(app_dir(), SAVE_KEY)


def load_best() -> int:
    try:
        with open(save_path(), "r", encoding="utf-8") as f:
            data = json.load(f)
        return int(data.get("best_score", 0))
    except Exception:
        return 0


def save_best(score: int) -> None:
    try:
        with open(save_path(), "w", encoding="utf-8") as f:
            json.dump({"best_score": int(score)}, f, ensure_ascii=False, indent=2)
    except Exception:
        pass


def clear_save() -> None:
    try:
        if os.path.exists(save_path()):
            os.remove(save_path())
    except Exception:
        pass


@dataclass
class Pipe:
    x: float
    w: float
    gap_y: float
    gap_h: float
    speed: float
    scored: bool = False


@dataclass
class Cloud:
    x: float
    y: float
    s: float
    v: float


class Button:
    def __init__(self, rect: pygame.Rect, label: str, font: pygame.font.Font, bg=(255, 255, 255), fg=(34, 39, 45)):
        self.rect = rect
        self.label = label
        self.font = font
        self.bg = bg
        self.fg = fg

    def draw(self, screen: pygame.Surface) -> None:
        pos = pygame.mouse.get_pos()
        hover = self.rect.collidepoint(pos)
        color = tuple(max(0, c - (10 if hover else 0)) for c in self.bg)
        pygame.draw.rect(screen, color, self.rect, border_radius=14)
        pygame.draw.rect(screen, (42, 45, 48), self.rect, 2, border_radius=14)
        text = self.font.render(self.label, True, self.fg)
        screen.blit(text, text.get_rect(center=self.rect.center))

    def hit(self, pos) -> bool:
        return self.rect.collidepoint(pos)


class FlyingBirdGame:
    def __init__(self) -> None:
        pygame.init()
        pygame.display.set_caption("Flying Bird")
        self.screen = pygame.display.set_mode((W, H))
        self.clock = pygame.time.Clock()
        self.font_sm = pygame.font.SysFont("microsoftyahei,arial", 18)
        self.font = pygame.font.SysFont("microsoftyahei,arial", 26, bold=True)
        self.font_big = pygame.font.SysFont("microsoftyahei,arial", 54, bold=True)
        self.font_huge = pygame.font.SysFont("microsoftyahei,arial", 72, bold=True)
        self.state = MENU
        self.prev_state = MENU
        self.best = load_best()
        self.score = 0
        self.bird_x = 136.0
        self.bird_y = 260.0
        self.bird_vy = 0.0
        self.bird_r = 18
        self.wing = 0.0
        self.pipes: list[Pipe] = []
        self.pipe_timer = 0.0
        self.clouds = self.make_clouds()
        self.shake = 0.0
        self.reset_btn = Button(pygame.Rect(14, 14, 112, 36), "重置进度", self.font_sm)
        self.confirm_yes = Button(pygame.Rect(126, 390, 100, 42), "确认", self.font)
        self.confirm_no = Button(pygame.Rect(254, 390, 100, 42), "取消", self.font)

    def make_clouds(self) -> list[Cloud]:
        return [
            Cloud(44, 96, 1.0, 12),
            Cloud(220, 60, 0.7, 9),
            Cloud(370, 136, 0.85, 11),
            Cloud(110, 178, 0.55, 8),
        ]

    def difficulty(self):
        pipe_speed = min(305, 185 + self.score * 4.2)
        gap = max(132, 174 - self.score * 1.1)
        spawn = max(1.18, 1.65 - self.score * 0.007)
        return pipe_speed, gap, spawn

    def reset_world(self) -> None:
        self.state = PLAYING
        self.score = 0
        self.bird_x = 136.0
        self.bird_y = 260.0
        self.bird_vy = 0.0
        self.wing = 0.0
        self.pipes.clear()
        self.clouds = self.make_clouds()
        self.pipe_timer = 1.08
        self.shake = 0.0

    def spawn_pipe(self) -> None:
        speed, gap, _ = self.difficulty()
        margin = 82
        min_center = margin + gap / 2
        max_center = GROUND_Y - margin - gap / 2
        gap_center = min_center + random.random() * (max_center - min_center)
        self.pipes.append(Pipe(W + 30, 76, gap_center - gap / 2, gap, speed))

    def jump(self) -> None:
        if self.state in (MENU, GAME_OVER):
            self.reset_world()
            return
        if self.state == PLAYING:
            self.bird_vy = -360
            self.wing = 1.0

    def game_over(self) -> None:
        if self.state != PLAYING:
            return
        self.state = GAME_OVER
        self.shake = 14
        if self.score > self.best:
            self.best = self.score
            save_best(self.best)

    @staticmethod
    def rect_hit(a: pygame.Rect, b: pygame.Rect) -> bool:
        return a.colliderect(b)

    def handle_events(self) -> bool:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                return False
            if event.type == pygame.KEYDOWN:
                if self.state == RESET_CONFIRM:
                    if event.key == pygame.K_ESCAPE:
                        self.state = self.prev_state
                    elif event.key in (pygame.K_RETURN, pygame.K_y):
                        clear_save()
                        self.best = 0
                        self.state = MENU
                    continue
                if event.key in (pygame.K_SPACE, pygame.K_UP):
                    self.jump()
                elif event.key == pygame.K_p and self.state in (PLAYING, PAUSED):
                    self.state = PAUSED if self.state == PLAYING else PLAYING
                elif event.key == pygame.K_r:
                    self.reset_world()
                elif event.key == pygame.K_ESCAPE:
                    return False
            if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                if self.state == RESET_CONFIRM:
                    if self.confirm_yes.hit(event.pos):
                        clear_save()
                        self.best = 0
                        self.state = MENU
                    elif self.confirm_no.hit(event.pos):
                        self.state = self.prev_state
                    continue
                if self.reset_btn.hit(event.pos):
                    self.prev_state = self.state
                    self.state = RESET_CONFIRM
                    continue
                self.jump()
        return True

    def update(self, dt: float) -> None:
        for c in self.clouds:
            c.x -= c.v * dt
            if c.x < -120:
                c.x = W + 120 + random.random() * 60

        if self.state != PLAYING:
            return

        speed, _, spawn = self.difficulty()
        self.bird_vy += 910 * dt
        self.bird_y += self.bird_vy * dt
        self.wing = max(0, self.wing - dt * 4)

        self.pipe_timer -= dt
        if self.pipe_timer <= 0:
            self.spawn_pipe()
            self.pipe_timer = spawn

        for p in self.pipes:
            p.speed = speed
            p.x -= p.speed * dt
            if not p.scored and self.bird_x > p.x + p.w:
                p.scored = True
                self.score += 1
        self.pipes = [p for p in self.pipes if p.x + p.w > -30]

        if self.bird_y + self.bird_r >= GROUND_Y:
            self.bird_y = GROUND_Y - self.bird_r
            self.game_over()
        if self.bird_y - self.bird_r <= 0:
            self.bird_y = self.bird_r
            self.bird_vy = max(0, self.bird_vy)

        bird_rect = pygame.Rect(self.bird_x - self.bird_r + 3, self.bird_y - self.bird_r + 3, self.bird_r * 2 - 6, self.bird_r * 2 - 6)
        for p in self.pipes:
            top = pygame.Rect(p.x, 0, p.w, p.gap_y)
            bottom = pygame.Rect(p.x, p.gap_y + p.gap_h, p.w, GROUND_Y - (p.gap_y + p.gap_h))
            if bird_rect.colliderect(top) or bird_rect.colliderect(bottom):
                self.game_over()

    def draw_background(self) -> None:
        self.screen.fill((120, 202, 235))
        # light gradient bands
        for y in range(0, GROUND_Y, 8):
            shade = int(235 - y * 0.05)
            pygame.draw.rect(self.screen, (120, min(225, shade), 245), (0, y, W, 8))
        for c in self.clouds:
            self.draw_cloud(c)
        pygame.draw.rect(self.screen, (220, 178, 90), (0, GROUND_Y, W, GROUND_H))
        pygame.draw.rect(self.screen, (118, 190, 72), (0, GROUND_Y, W, 18))
        for x in range(0, W, 28):
            pygame.draw.line(self.screen, (179, 139, 71), (x, GROUND_Y + 30), (x - 12, H), 2)

    def draw_cloud(self, c: Cloud) -> None:
        color = (255, 255, 255)
        alpha_surf = pygame.Surface((140, 70), pygame.SRCALPHA)
        positions = [(30, 38, 22), (55, 28, 28), (84, 38, 22), (65, 42, 25)]
        for x, y, r in positions:
            pygame.draw.circle(alpha_surf, (*color, 210), (int(x * c.s), int(y * c.s)), int(r * c.s))
        self.screen.blit(alpha_surf, (c.x, c.y))

    def draw_pipe(self, p: Pipe) -> None:
        pipe_color = (49, 168, 84)
        dark = (30, 116, 58)
        x, w = int(p.x), int(p.w)
        top_rect = pygame.Rect(x, 0, w, int(p.gap_y))
        bot_rect = pygame.Rect(x, int(p.gap_y + p.gap_h), w, int(GROUND_Y - (p.gap_y + p.gap_h)))
        for rect, cap_y in [(top_rect, int(p.gap_y) - 16), (bot_rect, int(p.gap_y + p.gap_h))]:
            pygame.draw.rect(self.screen, pipe_color, rect)
            pygame.draw.rect(self.screen, dark, rect, 4)
        pygame.draw.rect(self.screen, pipe_color, (x - 8, int(p.gap_y) - 22, w + 16, 22))
        pygame.draw.rect(self.screen, dark, (x - 8, int(p.gap_y) - 22, w + 16, 22), 4)
        pygame.draw.rect(self.screen, pipe_color, (x - 8, int(p.gap_y + p.gap_h), w + 16, 22))
        pygame.draw.rect(self.screen, dark, (x - 8, int(p.gap_y + p.gap_h), w + 16, 22), 4)

    def draw_bird(self) -> None:
        angle = max(-0.6, min(1.0, self.bird_vy / 420))
        x, y = int(self.bird_x), int(self.bird_y)
        body = pygame.Surface((64, 48), pygame.SRCALPHA)
        pygame.draw.ellipse(body, (255, 214, 66), (8, 8, 40, 32))
        pygame.draw.ellipse(body, (245, 174, 40), (12, 15 + int(self.wing * 4), 24, 18))
        pygame.draw.circle(body, (255, 255, 255), (42, 17), 8)
        pygame.draw.circle(body, (34, 39, 45), (45, 17), 3)
        pygame.draw.polygon(body, (240, 103, 45), [(47, 24), (62, 29), (47, 34)])
        rot = pygame.transform.rotate(body, -math.degrees(angle))
        self.screen.blit(rot, rot.get_rect(center=(x, y)))

    def draw_text_center(self, text: str, font, y: int, color=(34, 39, 45)) -> None:
        surf = font.render(text, True, color)
        self.screen.blit(surf, surf.get_rect(center=(W // 2, y)))

    def draw(self) -> None:
        sx = sy = 0
        if self.shake > 0:
            sx = random.uniform(-self.shake / 2, self.shake / 2)
            sy = random.uniform(-self.shake / 2, self.shake / 2)
            self.shake = max(0, self.shake - 0.7)
        original = self.screen.copy() if (sx or sy) else None
        self.draw_background()
        for p in self.pipes:
            self.draw_pipe(p)
        self.draw_bird()
        self.reset_btn.draw(self.screen)
        score_surf = self.font_huge.render(str(self.score), True, (255, 255, 255))
        shadow = self.font_huge.render(str(self.score), True, (34, 39, 45))
        self.screen.blit(shadow, shadow.get_rect(center=(W // 2 + 3, 74 + 3)))
        self.screen.blit(score_surf, score_surf.get_rect(center=(W // 2, 74)))

        if self.state == MENU:
            self.draw_overlay()
            self.draw_text_center("Flying Bird", self.font_big, 245)
            self.draw_text_center("空格 / 点击开始", self.font, 312)
            self.draw_text_center(f"最高分：{self.best}", self.font, 354)
        elif self.state == PAUSED:
            self.draw_overlay()
            self.draw_text_center("PAUSED", self.font_big, 310)
            self.draw_text_center("按 P 继续", self.font, 365)
        elif self.state == GAME_OVER:
            self.draw_overlay()
            self.draw_text_center("GAME OVER", self.font_big, 254, (190, 46, 46))
            self.draw_text_center(f"分数：{self.score}    最高分：{self.best}", self.font, 326)
            self.draw_text_center("按 R / 空格 / 点击重开", self.font, 374)
        elif self.state == RESET_CONFIRM:
            self.draw_overlay(alpha=190)
            card = pygame.Rect(64, 268, 352, 188)
            pygame.draw.rect(self.screen, (255, 255, 255), card, border_radius=22)
            pygame.draw.rect(self.screen, (42, 45, 48), card, 2, border_radius=22)
            self.draw_text_center("确认清空进度？", self.font, 315)
            self.draw_text_center("这会删除最高分记录。", self.font_sm, 350)
            self.confirm_yes.draw(self.screen)
            self.confirm_no.draw(self.screen)

        pygame.display.flip()

    def draw_overlay(self, alpha=160) -> None:
        s = pygame.Surface((W, H), pygame.SRCALPHA)
        s.fill((247, 249, 251, alpha))
        self.screen.blit(s, (0, 0))

    def run(self) -> None:
        running = True
        while running:
            dt = min(0.05, self.clock.tick(60) / 1000.0)
            running = self.handle_events()
            self.update(dt)
            self.draw()
        pygame.quit()


if __name__ == "__main__":
    FlyingBirdGame().run()
