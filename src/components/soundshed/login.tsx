import * as React from "react";
import { Alert, Button, Form, Modal } from "react-bootstrap";
import { AppStateStore } from "../../core/appViewModel";

const LoginControl = ({ signInRequired, onSignIn }) => {
  const [email, setEmail] = React.useState("");
  const [pwd, setPwd] = React.useState("");

  const [signInFailed, setSignInFailed] = React.useState(false);

  const handleSubmit = (event) => {
    event.preventDefault();

    onSignIn({ email: email, password: pwd }).then((loggedIn) => {
      if (!loggedIn) {
        setSignInFailed(true);
      } else {
        setSignInFailed(false);
      }
    });

   
  };

  const handleCancel = () => {
    AppStateStore.update((s) => {
      s.isSignInRequired = false;
    });
  };

  return (
    <Modal show={signInRequired}>
      <Modal.Body>
        <div>
          <p>
            Sign in to your Soundshed.com account to share content with the
            community:
          </p>

          <Form onSubmit={handleSubmit}>
            <Form.Group controlId="formBasicEmail">
              <Form.Label>Email address</Form.Label>
              <Form.Control
                type="email"
                placeholder="Enter email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                }}
              />
            </Form.Group>

            <Form.Group controlId="formBasicPassword">
              <Form.Label>Password</Form.Label>
              <Form.Control
                type="password"
                placeholder="Password"
                value={pwd}
                onChange={(event) => {
                  setPwd(event.target.value);
                }}
              />
            </Form.Group>

            {signInFailed ? (
              <Alert variant="danger">
                Sign In failed. Check email address and password are correct.
              </Alert>
            ) : (
              ""
            )}

            <Button variant="secondary" type="button" onClick={handleCancel}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              Sign In
            </Button>
          </Form>
        </div>
      </Modal.Body>
    </Modal>
  );
};
export default LoginControl;
