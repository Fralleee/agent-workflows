import { describe, expect, it } from "bun:test";
import { setupPageHtml } from "../src/views/setup-page.js";
import { PROFILES } from "../src/profiles.js";

describe("setupPageHtml", () => {
  it("escapes the installation_id in the hidden field", () => {
    const html = setupPageHtml('1<script>alert("x")</script>');
    expect(html).toContain('value="1&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"');
    expect(html).not.toContain("<script>alert");
  });

  it("renders one card per profile in the catalog", () => {
    const html = setupPageHtml("12345");
    for (const p of PROFILES) {
      expect(html).toContain(`value="${p.id}"`);
      expect(html).toContain(p.label);
    }
  });

  it("includes all three autofill traps", () => {
    const html = setupPageHtml("12345");
    expect(html).toContain('name="_trap_username"');
    expect(html).toContain('name="_trap_email"');
    expect(html).toContain('name="_trap_password"');
  });

  it("includes the custom-toggle disclosure", () => {
    const html = setupPageHtml("12345");
    expect(html).toContain('id="custom-toggle"');
    expect(html).toContain('name="custom_provider"');
    expect(html).toContain('name="custom_model"');
  });

  it("includes the show/hide key toggle and the script tag", () => {
    const html = setupPageHtml("12345");
    expect(html).toContain('id="api_key_toggle"');
    expect(html).toContain('<script src="/setup.js">');
  });

  it("renders exactly one Recommended badge", () => {
    // ">Recommended<" matches the badge text content, not the CSS class
    // selector that defines the badge style.
    const html = setupPageHtml("12345");
    const matches = html.match(/>Recommended</g) ?? [];
    expect(matches).toHaveLength(1);
  });
});
