import { render, screen, waitFor } from "@testing-library/react";
import QRCode from "qrcode";
import { describe, expect, it, vi } from "vitest";

import MfaQrCode from "./MfaQrCode";

vi.mock("qrcode", () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,generated")
  }
}));

describe("MfaQrCode", () => {
  it("encodes the authenticator URI locally and renders the resulting image", async () => {
    const otpAuthUri =
      "otpauth://totp/WorkflowHQ%3Aowner%40example.com?secret=ABCDEF&issuer=WorkflowHQ";
    render(<MfaQrCode otpAuthUri={otpAuthUri} />);

    await waitFor(() =>
      expect(QRCode.toDataURL).toHaveBeenCalledWith(otpAuthUri, expect.any(Object))
    );
    expect(
      await screen.findByRole("img", { name: /qr code for adding workflowhq/i })
    ).toHaveAttribute("src", "data:image/png;base64,generated");
  });
});
