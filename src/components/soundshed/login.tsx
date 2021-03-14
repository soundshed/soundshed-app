import * as React from "react";
import { Alert, Button, Form, Modal } from "react-bootstrap";
import { AppStateStore } from "../../core/appViewModel";

const LoginControl = ({ signInRequired, onSignIn , onRegistration}) => {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [pwd, setPwd] = React.useState("");

  const [isRegMode, setIsRegMode] = React.useState(false);
  const [signInFailed, setSignInFailed] = React.useState(false);
  const [registrationFailed, setRegistrationFailed] = React.useState(false);

  const handleSignIn = (event) => {
    event.preventDefault();

    onSignIn({ email: email, password: pwd}).then(
      (loggedIn) => {
        if (!loggedIn) {
          setSignInFailed(true);
        } else {
          setSignInFailed(false);
        }
      }
    );
  };

  const handleRegister = (event) => {
    event?.preventDefault();

    onRegistration({ email: email, password: pwd, name:name}).then(
      (loggedIn) => {
        if (!loggedIn) {
          setRegistrationFailed(true);
        } else {
          setRegistrationFailed(false);
        }
      }
    );
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
            {!isRegMode ? (
              <Button className="btn btn-sm btn-secondary ms-2"
                onClick={() => {
                  setIsRegMode(true);
                }}
              >
                New User
              </Button>
            ) : (
              <Button className="btn btn-sm btn-secondary ms-2"
                onClick={() => {
                  setIsRegMode(false);
                }}
              >
                Existing User
              </Button>
            )}
          </p>

          <Form>
            {isRegMode ? (
              <Form.Group controlId="formBasicName">
                <Form.Label>Name (public)</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="Enter a name or nickname"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                  }}
                />
              </Form.Group>
            ) : (
              ""
            )}

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

            <div className="mt-2">
              {signInFailed ? (
                <Alert variant="danger">
                  Sign In failed. Check email address and password are correct.
                </Alert>
              ) : (
                ""
              )}

              {registrationFailed ? (
                <Alert variant="danger">
                  Registration failed. Check email address and password are set
                  and you are not using an email that's already registered.
                </Alert>
              ) : (
                ""
              )}

              <Button variant="secondary" type="button" onClick={handleCancel}>
                Cancel
              </Button>

              {!isRegMode ? (
                <Button
                  variant="primary"
                  type="button"
                  onClick={handleSignIn}
                  className="float-end"
                >
                  Sign In
                </Button>
              ) : (
                <Button
                  variant="info"
                  type="button"
                  className="float-end"
                  onClick={handleRegister}
                >
                  New User
                </Button>
              )}
            </div>
          </Form>
        </div>
      </Modal.Body>
    </Modal>
  );
};
export default LoginControl;
